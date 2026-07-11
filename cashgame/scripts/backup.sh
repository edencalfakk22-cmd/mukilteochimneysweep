#!/usr/bin/env bash
# PostgreSQL backup with timestamped filename.
#
# Usage:
#   ./scripts/backup.sh [backup-dir]
#
# Reads DATABASE_URL from the environment or .env. Works both with a local
# PostgreSQL and with the docker-compose `db` service (set USE_DOCKER=1).
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/cashgame-$STAMP.sql.gz"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

if [ "${USE_DOCKER:-0}" = "1" ]; then
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:-cashgame}" "${POSTGRES_DB:-cashgame}" | gzip > "$FILE"
else
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set" >&2
    exit 1
  fi
  pg_dump "$DATABASE_URL" | gzip > "$FILE"
fi

echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Verify it restores with: ./scripts/restore.sh $FILE <target-database-url>"
