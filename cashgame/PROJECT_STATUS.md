# Project Status

Last updated: 2026-07-11 (v1.0.0)

## Completed

- [x] Project foundation: Next.js 16 + TS strict + Tailwind v4; Prisma 6 schema (13 entities) + initial migration on PostgreSQL 16
- [x] Money core: integer-agorot utilities, zero floating point
- [x] Pure ledger derivations (`src/lib/ledger-math.ts`) — player/session stats, debt splits (session vs. historical), expected cash, batch invariants
- [x] Ledger commands: buy-in/rebuy, payments (allocation strategies), cash-outs (debt-first / pay-full / manual split), drawer ops, adjustments, batch reversals — all in serializable transactions with idempotency keys and in-transaction balance recompute
- [x] Auth & security: bcrypt, DB sessions, rate-limited login, PIN unlock + idle auto-lock, server-side RBAC, inline manager approvals, CSRF origin check, security headers, audit log
- [x] Hebrew RTL UI: dashboard, sessions list/new, live session dashboard (cards+dialogs), close wizard, players + profile, debts screen, cash drawer, reports, settings + users, audit log, login/locked screens
- [x] Reports & exports: session/player/debt reports; PDF via RTL HTML→Chromium; XLSX (RTL); CSV (BOM); print styles; immutable closing snapshots
- [x] PWA: manifest, icons, safe service worker (no API caching, no offline writes), connectivity indicator
- [x] `npm run verify-ledger` integrity checker
- [x] Seed: 1 owner + manager + operator + viewer, 10 Hebrew players, 2 closed sessions, 1 active session — all created through the real service layer
- [x] Docker: multi-stage Dockerfile (standalone + Chromium + Hebrew fonts), docker-compose (app+db), dev-db compose
- [x] Startup scripts: start-dev.sh / start-dev.ps1 / start-dev.bat
- [x] Backup/restore scripts with timestamped archives
- [x] Documentation: README, ARCHITECTURE, ACCOUNTING_RULES, TEST_PLAN, DEPLOYMENT, USER_GUIDE_HE, CHANGELOG

## Test status

| Suite | Status |
| --- | --- |
| Unit (27 tests) | ✅ pass |
| Integration (19 tests) | ✅ pass |
| E2E (10 tests: 8 scenarios, desktop + mobile) | ✅ pass |
| `tsc --noEmit` | ✅ clean |
| `eslint` | ✅ clean |
| `next build` | ✅ clean |
| `verify-ledger` (seeded db) | ✅ no problems |

## In progress

- (nothing)

## Remaining / future ideas (not blocking)

- Multi-organization tenancy end-to-end (schema ready, untested)
- Offline write queue (deliberately excluded — writes are blocked offline for financial safety)
- Session-level report scheduling / email delivery
- Player statement date-range filters

## Known issues / limitations

- PDF export requires a Chromium binary (`CHROMIUM_PATH`); included in the Docker image, documented for bare-metal
- `docker build` could not be verified inside the development sandbox (no Docker daemon); Dockerfile mirrors the verified local production build steps
- WhatsApp integration is a user-initiated wa.me link only (by design — no bulk messaging)
