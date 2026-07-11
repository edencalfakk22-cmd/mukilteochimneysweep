#!/usr/bin/env bash
# Restore a PostgreSQL backup created by scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh backups/cashgame-20260711-120000.sql.gz [database-url]
#
# WARNING: restores INTO the target database. Restore into an EMPTY database
# (create a fresh one) and verify before switching the app to it.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?usage: restore.sh <backup-file.sql.gz> [database-url]}"
TARGET_URL="${2:-${DATABASE_URL:-}}"

if [ -f .env ] && [ -z "$TARGET_URL" ]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
  TARGET_URL="${DATABASE_URL:-}"
fi

if [ -z "$TARGET_URL" ]; then
  echo "ERROR: no target database url (arg 2 or DATABASE_URL)" >&2
  exit 1
fi

echo "Restoring $FILE into $TARGET_URL"
read -r -p "This overwrites data in the target database. Continue? [y/N] " ok
if [ "$ok" != "y" ] && [ "$ok" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

gunzip -c "$FILE" | psql "$TARGET_URL"
echo "Restore complete. Run 'npm run verify-ledger' against the restored database."
