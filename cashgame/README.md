# ניהול קופה — Cash-Game Management System

A production-ready, Hebrew-first (RTL) management system for **private cash-game sessions**: players, chip issuance, buy-ins, payments, debt tracking, cash-outs, cash-drawer reconciliation, immutable audit history and end-of-session reporting.

> This system manages money and people — **not** game logic. There are no cards, pots, blinds or hand histories.

## Core accounting principle

The system strictly separates two things that are often confused:

1. **Chips issued** to a player (what they play with).
2. **Money actually paid** by the player.

A player can receive 2,000 ₪ in chips while paying only 500 ₪ — the system tracks the 1,500 ₪ debt, applies later cash-outs against it by default, and never loses the distinction. All balances are derived from an **append-only ledger**; financial rows are never deleted, only reversed with a mandatory reason and full audit trail.

## Features

- **Live session dashboard** — large player cards, one-tap buy-in / payment / cash-out / exit, instant search, sticky summary (chips issued, payments, open debt, expected cash, active players, cash-outs).
- **Precise debt management** — session debt vs. historical debt, credit limits with warnings, standalone debt payments, player credit, manual adjustments (audited).
- **Cash drawer** — only CASH moves the physical drawer; Bit / bank transfer / card tracked separately; deposits, withdrawals, expenses, interim counts, closing reconciliation with mandatory explanations for differences.
- **Guided session closing** — 6-step wizard, unsettled-player detection, immutable closing snapshots, manager re-authentication, reopen with reason.
- **Reports & exports** — session summary, player statement, debt report; PDF (correct Hebrew RTL via headless Chromium), Excel (RTL sheets), CSV (UTF-8 BOM), print-friendly pages.
- **Roles** — OWNER / MANAGER / OPERATOR / VIEWER, enforced server-side; operator voids require inline manager approval (PIN).
- **Security** — bcrypt password hashing, DB-backed sessions, login rate limiting, auto-lock with PIN unlock, CSRF origin checks, security headers, Zod validation everywhere, structured audit log.
- **Integrity** — idempotency keys on every financial submission (double-click safe), serializable DB transactions, `npm run verify-ledger` recomputes every balance from the ledger and fails on any mismatch.
- **PWA** — installable, offline-safe: writes are disabled while offline and never silently queued or faked.

## Architecture (summary)

| Layer | Technology |
| --- | --- |
| Frontend + backend | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, Radix UI primitives, lucide icons |
| Forms & validation | React Hook Form + Zod (client), Zod (server) |
| Database | PostgreSQL 16, Prisma ORM 6 |
| Money | Integer agorot everywhere — no floating point |
| PDF | HTML templates → headless Chromium (playwright-core) |
| Excel | exceljs (RTL worksheets) |
| Tests | Vitest (unit + integration), React Testing Library (components), Playwright (E2E, desktop + mobile) |

Details: [ARCHITECTURE.md](./ARCHITECTURE.md) · accounting rules: [ACCOUNTING_RULES.md](./ACCOUNTING_RULES.md) · deployment: [DEPLOYMENT.md](./DEPLOYMENT.md) · Hebrew user guide: [USER_GUIDE_HE.md](./USER_GUIDE_HE.md) · test plan: [TEST_PLAN.md](./TEST_PLAN.md)

## Prerequisites

- Node.js 20+ (22 recommended)
- PostgreSQL 16 (local, or via `docker-compose.dev.yml`)
- For PDF export: Chromium (auto-detected; set `CHROMIUM_PATH` if needed — the Docker image includes it)

## Quick start (development)

```bash
# Linux / macOS
./start-dev.sh

# Windows
start-dev.bat        # or: powershell -File start-dev.ps1
```

The script checks Node, creates `.env` from `.env.example`, installs dependencies, starts a PostgreSQL container when Docker is available, applies migrations, seeds demo data and starts http://localhost:3000.

Manual steps, if you prefer:

```bash
cp .env.example .env            # edit DATABASE_URL + SESSION_SECRET
npm install
npx prisma migrate deploy       # create schema
npm run db:seed                 # demo data (skips if data exists)
npm run dev                     # http://localhost:3000
```

### Development credentials (DEVELOPMENT ONLY — change/delete in production)

| Role | Username | Password | PIN |
| --- | --- | --- | --- |
| Owner | `owner` | `Owner123!` | 1234 |
| Manager | `manager` | `Manager123!` | 2345 |
| Operator | `operator` | `Operator123!` | 3456 |
| Viewer | `viewer` | `Viewer123!` | — |

## Production (Docker)

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

The app container applies migrations automatically on startup and exposes a health check at `/api/health`. Full production guidance (reverse proxy, HTTPS, backups, updates, rollback): [DEPLOYMENT.md](./DEPLOYMENT.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run test` | Unit + integration tests |
| `npm run test:unit` | Pure accounting/unit tests |
| `npm run test:integration` | Service-layer tests against `cashgame_test` DB |
| `npm run test:e2e` | Playwright E2E (build first: `npm run build`) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop + recreate + reseed (destructive, dev only) |
| `npm run verify-ledger` | Recompute all balances from the ledger; non-zero exit on any mismatch |

## Backup & restore

```bash
./scripts/backup.sh                 # → backups/cashgame-YYYYMMDD-HHMMSS.sql.gz
./scripts/restore.sh backups/cashgame-....sql.gz postgresql://...  # into an EMPTY db
```

- With docker-compose: `USE_DOCKER=1 ./scripts/backup.sh`.
- **Daily automatic backups**: add a cron entry, e.g. `0 4 * * * cd /opt/cashgame && ./scripts/backup.sh /var/backups/cashgame`.
- **Verify** each backup restores into a scratch database, then run `npm run verify-ledger` against it.
- No cloud backup is included — ship the files off-host yourself (rsync/rclone).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `P1001: Can't reach database` | PostgreSQL isn't running / wrong `DATABASE_URL`. `docker compose -f docker-compose.dev.yml up -d` |
| PDF export returns 500 | Chromium not found — set `CHROMIUM_PATH=/usr/bin/chromium` (installed automatically in Docker) |
| "יותר מדי ניסיונות" on login | Login rate limit after 5 failures — wait 15 minutes or use another user |
| Hebrew broken in Excel CSV | Open the `.xlsx` export instead, or import the CSV as UTF-8 |
| `verify-ledger` fails | A real integrity problem — investigate before writing anything else; restore from backup if needed |
| Port 3000 busy | `PORT=3001 npm run dev` |

## Repository note

This app lives in the `cashgame/` directory of a repository whose root contains an unrelated static website; the two do not interact.
