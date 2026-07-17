#!/bin/sh
# PostgreSQL backup with rotation.
#
# Local/bare:   DATABASE_URL=... ./scripts/backup-db.sh
# Docker:       docker compose exec -T postgres sh -c 'pg_dump -U postgres laundry_management_system' | gzip > backup.sql.gz
#
# Schedule daily at 02:00 via cron:
#   0 2 * * * cd /opt/laundromat && BACKUP_DIR=/var/backups/laundromat ./scripts/backup-db.sh >> /var/log/laundromat/backup.log 2>&1
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_NAME="${POSTGRES_DB:-laundry_management_system}"
DB_USER="${POSTGRES_USER:-postgres}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup] Dumping $DB_NAME → $OUT"

if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$OUT"
elif command -v docker >/dev/null 2>&1; then
  # Fall back to the compose postgres service.
  docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"
else
  echo "[backup] Set DATABASE_URL or run where docker compose is available." >&2
  exit 1
fi

echo "[backup] Done: $(du -h "$OUT" | cut -f1)"

# Rotate old backups.
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Pruned backups older than ${RETENTION_DAYS} days."
