# Architecture

## Overview

Single Next.js 16 application (App Router) serving both the Hebrew RTL UI and a JSON API, backed by PostgreSQL via Prisma. All financial logic lives in a server-side service layer; the UI is a thin, fast client over it.

```
Browser (React 19, RTL, PWA)
   │  fetch JSON (credentials: same-origin)
   ▼
app/api/* route handlers  ──  Zod validation → requireActor() (RBAC) → service layer
   ▼
src/server/services/*     ──  business commands, DB transactions, audit
   ▼
Prisma → PostgreSQL       ──  append-only ledger + cached balances
```

## Data model

Entities (see `prisma/schema.prisma`):

- **Organization** — single-tenant per install (schema is multi-org capable).
- **User** — bcrypt password hash, optional PIN hash, role (OWNER/MANAGER/OPERATOR/VIEWER).
- **AuthSession** — server-side sessions; token stored as SHA-256 hash; sliding 7-day expiry; `lockedAt` for idle auto-lock.
- **LoginAttempt** — rate-limiting/lockout data.
- **Player** — profile + **cached** `currentDebt`/`currentCredit` (always recomputed from the ledger inside the same transaction that changes it).
- **GameSession** — status DRAFT/OPEN/CLOSING/CLOSED/REOPENED, opening cash, optimistic-concurrency `version`.
- **SessionPlayer** — membership + ACTIVE/LEFT/SETTLED status; unique (session, player).
- **LedgerBatch** — one user-facing command; carries the **idempotency key** (unique).
- **LedgerTransaction** — the append-only ledger (see below).
- **CashDrawerCount** — OPENING/INTERIM/CLOSING counts with expected/difference.
- **ClosingSnapshot** — immutable JSON report captured at every close (re-closes append, never overwrite).
- **AuditLog** — who/what/when/before/after/reason/IP for every sensitive action.
- **AppSetting** — operational preferences (quick amounts, approval requirements, thresholds…).

## Ledger approach

Every financial action appends immutable `LedgerTransaction` rows; nothing is ever deleted or numerically edited.

- Compound commands (e.g. buy-in = chips + payment + debt) create several rows grouped by one `LedgerBatch`.
- **Reversal**: originals get `status=REVERSED` (plus who/when/why), and a `REVERSAL` row referencing each original is appended. Balance computations skip `REVERSED` rows and `REVERSAL` markers; the audit trail keeps both visible.
- Money is **integer agorot** (1 ₪ = 100). `src/lib/money.ts` guards against floats at every entry point.
- All derivations live in **pure functions** (`src/lib/ledger-math.ts`) shared by the API, UI, reports, closing snapshots and the integrity checker — one implementation, no drift.

### Debt-reduction allocation

Debt-reducing rows (`DEBT_PAYMENT`, `CASHOUT_APPLIED_TO_DEBT`) carry
`metadata.allocation = { toSessionDebt, toHistoricalDebt }` where “session debt” means debt created in the row’s own session. This keeps *session debt* and *historical debt* separable at any point in time while global debt stays a simple sum.

## Accounting formulas

See ACCOUNTING_RULES.md for the full set with worked examples. Key identities:

- `playerPosition = chipsReturned − chipsIssued`
- Buy-in decomposition (per batch): `chips = paidNow + creditUsed + debtCreated`
- Cash-out decomposition (per batch): `chipsReturned = toDebt + paidOut + creditCreated`
- `expectedCash = openingCash + cashIn(CASH) + drawerDeposits − paidOut(CASH) − cashExpenses − drawerWithdrawals`
- Global debt: `Σ DEBT_CREATED − Σ DEBT_PAYMENT − Σ CASHOUT_APPLIED_TO_DEBT ± debt ADJUSTMENTs`

`npm run verify-ledger` recomputes every one of these from the raw ledger and compares against cached values, batch invariants, reversal links and drawer counts. Non-zero exit on any mismatch.

## Authorization model

Roles are ranked VIEWER < OPERATOR < MANAGER < OWNER. **Every check runs on the server** (`requireActor()` + `requireRole()`); the UI only hides what the server would reject anyway.

| Action | Minimum role |
| --- | --- |
| View sessions/reports | VIEWER |
| Record buy-in/payment/cash-out/exit/drawer ops, add players | OPERATOR |
| Open/close sessions, reopen (with reason), adjustments, void directly | MANAGER |
| Settings, user management, everything | OWNER |

Operator voids (and optionally high-risk actions) require an **inline manager approval**: the manager types username + PIN/password into the same dialog; the server verifies it (`verifyManagerApproval`). Session close always re-authenticates the closer.

## Transaction boundaries

Every command in `src/server/services/ledger.ts` runs in **one serializable Prisma transaction**: batch row → ledger rows → recomputed player balances → audit entry. A failure anywhere rolls back everything. Serialization conflicts (P2034) retry up to 3×.

## Idempotency strategy

Every financial form generates a UUID **idempotency key** when the dialog opens and sends it with the request. `LedgerBatch.idempotencyKey` is unique:

1. Key already stored → return the stored result, `duplicate: true`, write nothing.
2. Two racing requests → the second blocks on the unique index, gets P2002, then returns the winner’s stored result.

Combined with disabled-while-saving buttons, double clicks/retries can never double-charge.

## Offline strategy

Financial correctness beats fake offline support:

- A visible connectivity indicator; a red banner when offline.
- Writes fail fast with a clear Hebrew message while offline — nothing is queued silently and nothing is marked successful before the server confirms.
- The service worker caches only static assets (never `/api/*`, never queues POSTs); pages remain network-first so financial data is never stale-served.

## PDF generation

pdfkit/fontkit cannot render Hebrew bidi reliably (verified empirically: swallowed spaces, broken bracket mirroring). Reports are therefore rendered as RTL HTML templates (`src/server/reports/html.ts`) and printed to PDF by headless **Chromium** via `playwright-core` (`CHROMIUM_PATH`), which implements the full Unicode bidi algorithm. The Docker image installs `chromium` + `fonts-dejavu-core`.

## Notable version decisions

- **Prisma 6** (not 7): pinned deliberately — v7 changed generator/driver-adapter architecture mid-project; v6 is the stable, well-documented line.
- **Playwright browsers**: E2E and PDF use the system/preinstalled Chromium via `executablePath`, so no browser download is required at install time.
