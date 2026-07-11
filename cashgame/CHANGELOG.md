# Changelog

## 1.0.0 — 2026-07-11

First production-ready release.

### Milestones

- **Foundation** — Next.js 16 + TypeScript strict + Tailwind v4 scaffold; PostgreSQL 16 + Prisma 6 schema (13 entities, append-only ledger, audit log, settings); initial migration.
- **Accounting core** — integer-agorot money utilities; pure ledger derivations (player/session stats, debt splits, expected cash, batch invariants); 27 unit tests covering spec examples A–D.
- **Ledger commands** — buy-in/rebuy, payments with allocation strategies, cash-outs (debt-first / pay-full / manual split), drawer ops, adjustments, batch reversals; serializable transactions; idempotency keys; cached balances recomputed in-transaction.
- **Auth & security** — bcrypt, DB-backed sessions, rate-limited login with lockout, PIN quick-unlock with idle auto-lock, server-side RBAC, inline manager approvals, CSRF origin checks, security headers, safe error surface.
- **Hebrew RTL UI** — live session dashboard (summary cards, player cards, instant search/sort/filter, bottom-sheet dialogs), add-player flow with debt preview, session close wizard, players/profile, debts screen, cash drawer, reports, settings + user management, audit log; PWA manifest + icons + safe service worker + connectivity guard.
- **Reports** — session/player/debt reports; PDF via RTL HTML + headless Chromium (pdfkit rejected after empirical Hebrew bidi failures); RTL Excel via exceljs; CSV with BOM; print styles; immutable closing snapshots.
- **Integrity tooling** — `verify-ledger` CLI recomputing every balance and invariant from the raw ledger.
- **Tests** — 27 unit + 19 integration + 10 E2E (8 scenarios, desktop + mobile) all green; typecheck, lint and production build clean.
- **Ops** — Dockerfile (standalone output + Chromium + Hebrew fonts), docker-compose (app+db), dev compose, one-command start scripts (sh/ps1/bat), timestamped backup/restore scripts, full documentation set.
