#!/usr/bin/env bash
# One-command development startup (Linux/macOS)
set -euo pipefail
cd "$(dirname "$0")"

echo "== Cash-game dev startup =="

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 20+ from https://nodejs.org" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "No .env found — creating one from .env.example (edit passwords before production!)"
  cp .env.example .env
  sed -i.bak 's|CHANGE_ME_TO_A_LONG_RANDOM_STRING|'"$(openssl rand -hex 32 2>/dev/null || echo dev-secret-$RANDOM$RANDOM)"'|' .env && rm -f .env.bak
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start the dev database container when Docker is available and nothing listens on 5432.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null; then
    echo "Starting PostgreSQL via Docker..."
    docker compose -f docker-compose.dev.yml up -d
    sleep 3
  else
    exec 3>&- || true
  fi
fi

echo "Applying migrations..."
npx prisma migrate deploy

echo "Seeding demo data (skipped automatically if data exists)..."
npm run db:seed || true

echo
echo "Starting the app: http://localhost:3000"
echo "Dev login: owner / Owner123!  (see README.md)"
npm run dev
