#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

DEPLOY_BRANCH="${PICTOCHAT_BRANCH:-main}"

SSH_KEY="${PICTOCHAT_SSH_KEY:-/home/server/.ssh/id_ed25519}"
SSH_KNOWN_HOSTS="${PICTOCHAT_KNOWN_HOSTS:-/home/server/.ssh/known_hosts}"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -F /dev/null -o IdentitiesOnly=yes -i ${SSH_KEY} -o UserKnownHostsFile=${SSH_KNOWN_HOSTS}}"

echo "==> Actualizando código"
git fetch --prune origin
if git show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
  git checkout "$DEPLOY_BRANCH"
else
  git checkout -b "$DEPLOY_BRANCH" "origin/${DEPLOY_BRANCH}"
fi
git pull --ff-only origin "$DEPLOY_BRANCH"

echo "==> Construyendo y reiniciando PictoChat"
docker compose -p pictochat up --build -d --remove-orphans

echo "==> Esperando healthcheck"
for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null; then
    echo "PictoChat actualizado correctamente."
    docker compose -p pictochat ps
    exit 0
  fi
  sleep 2
done

echo "PictoChat no respondió en 60 segundos; mostrando logs recientes." >&2
docker compose -p pictochat logs --tail=100
exit 1
