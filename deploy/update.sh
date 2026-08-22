#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEPLOY_DIR="${PICTOCHAT_DEPLOY_DIR:-/opt/pictochat}"
COMPOSE_FILE="$DEPLOY_DIR/compose.prod.yml"
ENV_FILE="$DEPLOY_DIR/.env.production"
LOCK_FILE="/run/lock/pictochat-update.lock"
ROLLBACK_IMAGE="pictochat-local:rollback"

for required_file in "$COMPOSE_FILE" "$ENV_FILE"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Falta $required_file" >&2
    exit 1
  fi
done

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Ya hay una actualizacion de ChatInk en curso"
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${APP_IMAGE:?APP_IMAGE es obligatorio}"
: "${APP_DOMAIN:?APP_DOMAIN es obligatorio}"
DESIRED_IMAGE="$APP_IMAGE"

compose() {
  docker compose --project-name pictochat --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_app() {
  local container_id health
  for _attempt in {1..60}; do
    container_id="$(compose ps -q app 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$health" == "healthy" ]]; then
        return 0
      fi
      if [[ "$health" == "exited" || "$health" == "dead" ]]; then
        return 1
      fi
    fi
    sleep 2
  done
  return 1
}

wait_for_https() {
  for _attempt in {1..30}; do
    if curl --fail --silent --show-error --max-time 10 \
      --resolve "${APP_DOMAIN}:443:127.0.0.1" \
      "https://${APP_DOMAIN}/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  local previous_id="$1"
  if [[ -z "$previous_id" ]]; then
    echo "No existe una imagen anterior para rollback" >&2
    return 1
  fi

  echo "El despliegue fallo; restaurando la imagen anterior"
  docker image tag "$previous_id" "$ROLLBACK_IMAGE"
  export APP_IMAGE="$ROLLBACK_IMAGE"
  compose up --detach --no-deps app
  wait_for_app
}

container_id="$(compose ps -q app 2>/dev/null || true)"
previous_id=""
if [[ -n "$container_id" ]]; then
  previous_id="$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || true)"
fi

if [[ -n "$previous_id" ]]; then
  docker image tag "$previous_id" "$ROLLBACK_IMAGE"
fi

echo "Descargando $DESIRED_IMAGE"
export APP_IMAGE="$DESIRED_IMAGE"
compose pull app
if ! compose up --detach --no-deps app; then
  rollback "$previous_id" || true
  exit 1
fi

if ! wait_for_app || ! wait_for_https; then
  rollback "$previous_id" || true
  exit 1
fi

echo "ChatInk actualizado y saludable: https://${APP_DOMAIN}"
