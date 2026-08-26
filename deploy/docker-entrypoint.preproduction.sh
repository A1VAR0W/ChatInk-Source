#!/bin/sh
set -eu

read_secret() {
  variable_name="$1"
  file_path="$2"
  if [ ! -r "$file_path" ]; then
    echo "No se puede leer el secreto requerido: $file_path" >&2
    exit 1
  fi
  secret_value="$(tr -d '\r\n' < "$file_path")"
  if [ -z "$secret_value" ]; then
    echo "El secreto requerido esta vacio: $file_path" >&2
    exit 1
  fi
  export "$variable_name=$secret_value"
  unset secret_value
}

if [ -n "${TOKEN_SECRET_FILE:-}" ]; then
  read_secret TOKEN_SECRET "$TOKEN_SECRET_FILE"
  unset TOKEN_SECRET_FILE
fi

if [ -n "${DATABASE_URL_FILE:-}" ]; then
  read_secret DATABASE_URL "$DATABASE_URL_FILE"
  unset DATABASE_URL_FILE
fi

if [ "$(id -u)" -eq 0 ]; then
  exec gosu appuser "$@"
fi

exec "$@"
