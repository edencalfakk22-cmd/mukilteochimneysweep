# Test Plan

## Test matrix

| Layer | Tool | Database | Scope |
| --- | --- | --- | --- |
| Unit | Vitest (`tests/unit`) | none (pure functions) | money utils, every ledger derivation, batch invariants |
| Component | Vitest + React Testing Library (jsdom) | none | MoneyDisplay/MoneyInput formatting, quick amounts, badges, empty/error states, connectivity indicator |
| Integration | Vitest (`tests/integration`) | `cashgame_test` (migrated + truncated per file) | service commands, transactions, rollback, authz, auth, exports |
| E2E | Playwright (`e2e/`) | `cashgame_e2e` (migrated + truncated + seeded per run) | the 8 mandatory user scenarios in Hebrew, desktop + mobile viewports |

Run: `npm run test:unit` · `npm run test:integration` · `npm run build && npm run test:e2e` · everything: `npm test` then e2e.

## Unit coverage (tests/unit)

- Components (React Testing Library): agorot reporting while typing with separators, non-numeric input safety, external value sync, numeric keyboard attribute, debt badge not-color-alone, retry actions.
- Money: shekel↔agorot conversion, formatting, thousands separators, invalid input, negatives, overflow-safe sums.
- Ledger math: spec examples A–D verbatim; multiple rebuys/payments; credit create/use; reversals excluded from balances; manual adjustments (sign/target); session totals; payment-method separation; expected cash (only CASH moves the drawer); partial cash-outs and rebuy-after-cash-out; buy-in and cash-out batch invariants (positive and negative cases).

## Integration coverage (tests/integration)

- **auth.test.ts** — login success; wrong password and unknown user return identical errors; 5 failures → rate limit blocks even the correct password; inactive users rejected.
- **authz.test.ts** — viewer blocked from financial writes; operator blocked from open/close/reopen/adjustment; operator void requires manager approval (wrong secret rejected, PIN accepted); settings/users owner-only.
- **flows.test.ts** — full lifecycle (open → add → buy-in → payment → cash-out → exit → close → reopen → reverse) with exact balance assertions; Example D (historical debt isolation); Example C (split settlement); idempotency (sequential + concurrent duplicates → one batch); rollback (invalid manual allocation persists nothing); drawer guard (cash-out beyond drawer rejected); drawer ops (cash-only effect); close-with-difference requires explanation and lands in the report + XLSX export sanity.

## E2E scenarios (e2e/)

| # | Spec | Asserts |
| --- | --- | --- |
| 1 | clean-night | opening 5,000 → buy 1,000 cash → expected 6,000 → cash-out 1,500 → expected 4,500 → result +500 → close counted 4,500 → difference 0 |
| 2 | debt-cashout | 2,000 chips / 500 paid → debt 1,500 badge → cash-out 1,200 to debt → no cash out, debt 300 → close clean |
| 3 | historical-debt | seeded 1,000 debt intact after a clean later session (never overwritten) |
| 4 | split-settlement | unpaid 2,000, return 3,000 → 2,000 to debt + 1,000 cash → debt 0, result +1,000 |
| 5 | reversal-approval | operator void → approval required → manager PIN inline → original visible as reversed → audit entry → totals restored |
| 6 | double-click | dblclick on confirm → exactly one rebuy exists |
| 7 | payment-methods | cash vs bit: only cash moves expected drawer; bit listed separately |
| 8 | close-difference | counted ≠ expected → explanation forced → difference + explanation in the report; closed session locked |

Scenarios 1–2 also run in the mobile project (Pixel 7 viewport); the rest on desktop Chrome. The suite runs serially against one seeded database.

## Known edge cases covered by design

- Winning player returns more chips than issued (no false "unsettled chips").
- Player exits after losing everything (declaration flow, debt persists).
- Rejoin after leaving; multiple partial cash-outs; rebuy after cash-out.
- Payment exceeding debt requires explicit credit confirmation.
- Concurrent duplicate submissions (same idempotency key) — single execution.
- Reversal of a reversal is rejected; double reversal detected by verify-ledger.
- Closing blocked while players are ACTIVE; reopen requires reason; snapshots append.

## Not covered / known limitations

- Multi-organization tenancy is schema-ready but untested end-to-end (single-org deployments assumed).
- Offline queueing is intentionally not implemented (writes are blocked offline).
- Load/performance testing is out of scope for this version.
