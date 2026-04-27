#!/bin/sh
# Bootstraps the PocketBase superuser from environment variables before
# starting the server. Runs on every container start; `upsert` is idempotent
# so re-applying the same credentials is a no-op.

set -eu

: "${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL is required (set it in .env)}"
: "${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD is required (set it in .env)}"

case "$PB_SUPERUSER_EMAIL" in
  *@*.*) ;;
  *)
    echo "PB_SUPERUSER_EMAIL does not look like an email: $PB_SUPERUSER_EMAIL" >&2
    exit 1
    ;;
esac

if [ "${#PB_SUPERUSER_PASSWORD}" -lt 10 ]; then
  echo "PB_SUPERUSER_PASSWORD must be at least 10 characters (PocketBase minimum)" >&2
  exit 1
fi

pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data

exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
