#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "$SEED_DEMO_DATA" = "1" ]; then
  echo "SEED_DEMO_DATA=1 — seeding demo data (skips automatically if data exists)"
  node -e "console.log('Seeding must be run from the source tree: npm run db:seed')" || true
fi

echo "Starting server on port ${PORT:-3000}..."
exec node server.js
