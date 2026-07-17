#!/bin/sh
set -e

# Wait for the database to accept connections, then sync the schema and start.
echo "[entrypoint] Applying database schema…"

# This project has used `prisma db push` throughout (additive schema changes),
# so we keep that here for an out-of-the-box working deploy. Teams that prefer
# migration history should commit migrations and set MIGRATE_CMD accordingly,
# e.g. MIGRATE_CMD="migrate deploy".
MIGRATE_CMD="${MIGRATE_CMD:-db push --skip-generate}"

# Retry briefly in case Postgres is still warming up (compose healthcheck covers
# most of this, but this makes the container resilient to slow starts).
n=0
until npx prisma $MIGRATE_CMD; do
  n=$((n + 1))
  if [ "$n" -ge 10 ]; then
    echo "[entrypoint] Database not ready after retries — exiting."
    exit 1
  fi
  echo "[entrypoint] DB not ready yet (attempt $n) — retrying in 3s…"
  sleep 3
done

echo "[entrypoint] Starting API…"
exec node src/index.js
