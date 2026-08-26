#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${CHATINK_PREPRODUCTION_BRANCH:-develop}"
UPSTREAM="${CHATINK_PREPRODUCTION_UPSTREAM:-origin/develop}"
PUBLIC_URL="${CHATINK_PREPRODUCTION_URL:-https://chat-ink.tail552c89.ts.net:8443}"
HTTP_DOMAIN="${CHATINK_PREPRODUCTION_HTTP_DOMAIN:-chat-ink-staging.81.0.45.99.nip.io}"
ARTIFACTS_DIR="${CHATINK_PREPRODUCTION_ARTIFACTS_DIR:-$APP_DIR/release-artifacts}"
SECRETS_DIR="${CHATINK_PREPRODUCTION_SECRETS_DIR:-/home/server/.config/chatink/preproduction}"
COMPOSE_FILE="$APP_DIR/deploy/compose.preproduction.yml"
APP_VERSION="${CHATINK_RELEASE_VERSION:-$(awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$APP_DIR/package.json")}"

if [[ -z "$APP_VERSION" ]]; then
  echo "No se pudo determinar la versión de preproducción desde package.json" >&2
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
chmod 0755 "$ARTIFACTS_DIR"
mkdir -p "$SECRETS_DIR"
chmod 0700 "$SECRETS_DIR"

existing_container="$(sudo -n docker ps -aq \
  --filter label=com.docker.compose.project=chatink-preproduction \
  --filter label=com.docker.compose.service=app | head -n 1)"

if [[ ! -s "$SECRETS_DIR/token_secret" ]]; then
  legacy_token=""
  if [[ -n "$existing_container" ]]; then
    legacy_token="$(sudo -n docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$existing_container" | sed -n 's/^TOKEN_SECRET=//p')"
  fi
  printf '%s\n' "${legacy_token:-$(openssl rand -base64 48)}" > "$SECRETS_DIR/token_secret"
  chmod 0600 "$SECRETS_DIR/token_secret"
fi

if [[ ! -s "$SECRETS_DIR/database_password" ]]; then
  openssl rand -hex 32 > "$SECRETS_DIR/database_password"
  chmod 0600 "$SECRETS_DIR/database_password"
fi

if [[ ! -s "$SECRETS_DIR/database_url" ]]; then
  database_password="$(tr -d '\r\n' < "$SECRETS_DIR/database_password")"
  printf 'postgresql://chatink_pre:%s@database:5432/chatink_preproduction\n' "$database_password" > "$SECRETS_DIR/database_url"
  chmod 0600 "$SECRETS_DIR/database_url"
  unset database_password
fi

compose() {
  sudo -n env \
    ALLOWED_ORIGINS="$ALLOWED_ORIGINS" \
    ROOM_EMPTY_TTL_MS="${ROOM_EMPTY_TTL_MS:-300000}" \
    MAX_FILE_BYTES="${MAX_FILE_BYTES:-26214400}" \
    MIN_SUPPORTED_CLIENT_VERSION="${MIN_SUPPORTED_CLIENT_VERSION:-$APP_VERSION}" \
    LATEST_CLIENT_VERSION="${LATEST_CLIENT_VERSION:-$APP_VERSION}" \
    CLIENT_RELEASE_URL="${CLIENT_RELEASE_URL:-$PUBLIC_URL/preproduction-sidestore-source.json}" \
    PUBLIC_APP_URL="$PUBLIC_URL" \
    CHATINK_PREPRODUCTION_ARTIFACTS_DIR="$ARTIFACTS_DIR" \
    CHATINK_PREPRODUCTION_SECRETS_DIR="$SECRETS_DIR" \
    docker compose --project-name chatink-preproduction -f "$COMPOSE_FILE" "$@"
}
ALLOWED_ORIGINS="${PUBLIC_URL},http://${HTTP_DOMAIN},https://localhost,capacitor://localhost"
export ALLOWED_ORIGINS

cd "$APP_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git merge --ff-only "$UPSTREAM"
compose up --build --detach --remove-orphans

for _attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3002/api/health >/dev/null && \
    curl --fail --silent --show-error --max-time 10 "${PUBLIC_URL}/api/health" >/dev/null; then
    echo "Preproducción actualizada y saludable: ${PUBLIC_URL}"
    exit 0
  fi
  sleep 2
done

compose logs --tail=100 app >&2
echo "La preproducción no alcanzó un estado saludable" >&2
exit 1
