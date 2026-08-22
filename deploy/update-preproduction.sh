#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${CHATINK_PREPRODUCTION_BRANCH:-preproduction}"
UPSTREAM="${CHATINK_PREPRODUCTION_UPSTREAM:-origin/develop}"
PUBLIC_URL="${CHATINK_PREPRODUCTION_URL:-https://chat-ink.tail552c89.ts.net:8443}"
HTTP_DOMAIN="${CHATINK_PREPRODUCTION_HTTP_DOMAIN:-chat-ink-staging.81.0.45.99.nip.io}"
ARTIFACTS_DIR="${CHATINK_PREPRODUCTION_ARTIFACTS_DIR:-$APP_DIR/release-artifacts}"
COMPOSE_FILE="$APP_DIR/deploy/compose.preproduction.yml"

mkdir -p "$ARTIFACTS_DIR"
chmod 0755 "$ARTIFACTS_DIR"

compose() {
  sudo -n env \
    TOKEN_SECRET="$TOKEN_SECRET" \
    ALLOWED_ORIGINS="$ALLOWED_ORIGINS" \
    ROOM_EMPTY_TTL_MS="${ROOM_EMPTY_TTL_MS:-300000}" \
    MAX_FILE_BYTES="${MAX_FILE_BYTES:-26214400}" \
    MIN_SUPPORTED_CLIENT_VERSION="${MIN_SUPPORTED_CLIENT_VERSION:-0.0.0}" \
    LATEST_CLIENT_VERSION="${LATEST_CLIENT_VERSION:-0.0.0}" \
    CLIENT_RELEASE_URL="${CLIENT_RELEASE_URL:-https://github.com/A1VAR0W/Chat-Ink/releases}" \
    PUBLIC_APP_URL="$PUBLIC_URL" \
    CHATINK_PREPRODUCTION_ARTIFACTS_DIR="$ARTIFACTS_DIR" \
    docker compose --project-name chatink-preproduction -f "$COMPOSE_FILE" "$@"
}

existing_container="$(sudo -n docker ps -aq \
  --filter label=com.docker.compose.project=chatink-preproduction \
  --filter label=com.docker.compose.service=app | head -n 1)"
if [[ -n "$existing_container" ]]; then
  TOKEN_SECRET="$(sudo -n docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$existing_container" | sed -n 's/^TOKEN_SECRET=//p')"
fi
TOKEN_SECRET="${TOKEN_SECRET:-$(openssl rand -base64 48)}"
ALLOWED_ORIGINS="${PUBLIC_URL},http://${HTTP_DOMAIN},https://localhost,capacitor://localhost"
export TOKEN_SECRET ALLOWED_ORIGINS

cd "$APP_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git merge --ff-only "$UPSTREAM"
compose up --build --detach --remove-orphans

for _attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3002/api/health >/dev/null && \
    curl --fail --silent --show-error --max-time 10 "${PUBLIC_URL}/api/health" >/dev/null; then
    unset TOKEN_SECRET
    echo "Preproducción actualizada y saludable: ${PUBLIC_URL}"
    exit 0
  fi
  sleep 2
done

unset TOKEN_SECRET
compose logs --tail=100 app >&2
echo "La preproducción no alcanzó un estado saludable" >&2
exit 1
