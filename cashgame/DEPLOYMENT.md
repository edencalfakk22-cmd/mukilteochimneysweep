# Deployment

## Docker production setup (recommended)

```bash
git clone <repo> && cd <repo>/cashgame
cp .env.example .env
```

Edit `.env`:

```env
POSTGRES_PASSWORD=<strong password>        # used by docker-compose
SESSION_SECRET=<openssl rand -hex 32>
# POSTGRES_USER / POSTGRES_DB / APP_PORT optional (defaults: cashgame / cashgame / 3000)
```

Start:

```bash
docker compose up -d --build
docker compose logs -f app     # wait for "Starting server on port 3000"
```

- The app container runs `prisma migrate deploy` automatically on every start (safe, additive).
- Health check: `GET /api/health` → `{"status":"ok","db":"up"}`.
- The image includes Chromium + DejaVu fonts for Hebrew PDF export.

### First users

Seed demo data only in development. In production create the owner directly:

```bash
docker compose exec app node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
(async () => {
  const p = new PrismaClient();
  const org = await p.organization.create({ data: { name: 'הארגון שלי' } });
  await p.appSetting.create({ data: { organizationId: org.id } });
  await p.user.create({ data: {
    organizationId: org.id, name: 'בעלים', username: 'owner',
    passwordHash: bcrypt.hashSync(process.env.OWNER_PASSWORD, 12), role: 'OWNER',
  }});
  console.log('owner created');
  await p.\$disconnect();
})();" 
# run with: docker compose exec -e OWNER_PASSWORD='...' app ...
```

(Or temporarily set `NODE_ENV=development`, run the seed from a source checkout, then change all passwords.)

## Reverse proxy + HTTPS

Serve behind nginx/Caddy/Traefik with TLS. Caddy example (automatic HTTPS):

```
cash.example.com {
    reverse_proxy localhost:3000
}
```

nginx essentials: proxy to `127.0.0.1:3000`, set `X-Forwarded-For` (used for audit/rate-limit) and `Host`. Cookies are `secure` in production, so HTTPS is required for login to work.

## PostgreSQL

- Data lives in the `pgdata` docker volume (or your managed PostgreSQL).
- Recommended: `max_connections` defaults are fine; the app uses one Prisma pool.
- For a managed/external database, remove the `db` service and point `DATABASE_URL` at it.

## Backups

- `USE_DOCKER=1 ./scripts/backup.sh /var/backups/cashgame` — timestamped `pg_dump | gzip`.
- Daily cron: `0 4 * * * cd /opt/cashgame && USE_DOCKER=1 ./scripts/backup.sh /var/backups/cashgame`.
- Test restores regularly: restore into a scratch DB with `./scripts/restore.sh`, then run `npm run verify-ledger` against it.
- Copy backups off-host (rsync/rclone/object storage). No cloud backup is built in.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes | Salts session-token hashes (≥32 random hex chars) |
| `CHROMIUM_PATH` | no | Chromium binary for PDF export (Docker image sets it) |
| `PORT` | no | App port (default 3000) |
| `SHADOW_DATABASE_URL` | dev only | For `prisma migrate dev` |

## Update process

```bash
git pull
docker compose build app
docker compose up -d app      # entrypoint applies new migrations automatically
docker compose logs -f app
```

Take a backup **before** updating. Migrations are forward-only.

## Rollback process

1. `git checkout <previous tag>` and `docker compose build app`.
2. If the newer version added migrations, restore the pre-update database backup
   (schema must match the code you roll back to):
   `./scripts/restore.sh <backup> <db-url>` into a fresh DB, repoint `DATABASE_URL`.
3. `docker compose up -d app` and verify `/api/health` + `npm run verify-ledger`.

## Non-Docker deployment

```bash
npm ci && npx prisma generate && npm run build
DATABASE_URL=... SESSION_SECRET=... npx prisma migrate deploy
DATABASE_URL=... SESSION_SECRET=... CHROMIUM_PATH=/usr/bin/chromium npm run start
```

Requires Node 20+, PostgreSQL 16, and `chromium` + a Hebrew-capable font (`fonts-dejavu-core`) on the host for PDF export. Run under systemd or pm2 for supervision.
