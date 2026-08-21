#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ "$EUID" -ne 0 ]]; then
  echo "Ejecuta este instalador con sudo" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ENV="$SCRIPT_DIR/.env.production"
TARGET_DIR="/opt/pictochat"
SYSTEMD_DIR="/etc/systemd/system"

for command_name in docker curl flock systemctl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Falta el comando requerido: $command_name" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Falta el plugin Docker Compose" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_ENV" ]]; then
  echo "Copia deploy/.env.production.example a deploy/.env.production y configura sus valores" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$SOURCE_ENV"
set +a

: "${APP_DOMAIN:?APP_DOMAIN es obligatorio}"
: "${ACME_EMAIL:?ACME_EMAIL es obligatorio}"
: "${APP_IMAGE:?APP_IMAGE es obligatorio}"
: "${TOKEN_SECRET:?TOKEN_SECRET es obligatorio}"

if [[ ! "$APP_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "APP_DOMAIN debe contener solo el dominio, sin https:// ni rutas" >&2
  exit 1
fi

if [[ ${#TOKEN_SECRET} -lt 32 || "$TOKEN_SECRET" == replace-* ]]; then
  echo "Genera TOKEN_SECRET con: openssl rand -base64 48" >&2
  exit 1
fi

install -d -m 0750 "$TARGET_DIR"
install -m 0644 "$SCRIPT_DIR/compose.prod.yml" "$TARGET_DIR/compose.prod.yml"
install -m 0644 "$SCRIPT_DIR/Caddyfile" "$TARGET_DIR/Caddyfile"
install -m 0750 "$SCRIPT_DIR/update.sh" "$TARGET_DIR/update.sh"
install -m 0600 "$SOURCE_ENV" "$TARGET_DIR/.env.production"
install -m 0644 "$SCRIPT_DIR/systemd/pictochat-update.service" "$SYSTEMD_DIR/pictochat-update.service"
install -m 0644 "$SCRIPT_DIR/systemd/pictochat-update.timer" "$SYSTEMD_DIR/pictochat-update.timer"

docker compose --project-name pictochat --env-file "$TARGET_DIR/.env.production" -f "$TARGET_DIR/compose.prod.yml" config --quiet
docker compose --project-name pictochat --env-file "$TARGET_DIR/.env.production" -f "$TARGET_DIR/compose.prod.yml" pull
docker compose --project-name pictochat --env-file "$TARGET_DIR/.env.production" -f "$TARGET_DIR/compose.prod.yml" up --detach

PICTOCHAT_DEPLOY_DIR="$TARGET_DIR" "$TARGET_DIR/update.sh"

systemctl daemon-reload
systemctl enable --now pictochat-update.timer

echo "Instalacion completada: https://${APP_DOMAIN}"
echo "Temporizador: systemctl list-timers pictochat-update.timer"
