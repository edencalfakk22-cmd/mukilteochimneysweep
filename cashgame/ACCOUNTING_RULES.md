# Accounting Rules

All amounts are **integer agorot** (1 ₪ = 100 agorot). No floating-point arithmetic is ever used for money. The UI works in whole shekels and converts at the boundary.

## 1. The two ledgers that must never be confused

| Concept | Meaning |
| --- | --- |
| **Chips issued** (`chipsIssued`) | Value of chips physically handed to a player |
| **Payments received** (`paymentsReceived`) | Money actually collected from the player |

Issuing chips without payment creates **debt** — automatically, precisely, and visibly.

## 2. Transaction types

| Type | Effect |
| --- | --- |
| `SESSION_BUY_IN` / `SESSION_REBUY` | + chips issued |
| `PAYMENT_RECEIVED` | + money in (attached to a buy-in) |
| `CHIPS_RETURNED` | + chips returned (cash-out) |
| `CASH_PAID_TO_PLAYER` | + money out to player (any method; only CASH moves the drawer) |
| `DEBT_CREATED` | + player debt (unpaid part of a buy-in) |
| `DEBT_PAYMENT` | − player debt (standalone repayment; money in) |
| `CASHOUT_APPLIED_TO_DEBT` | − player debt (chips value offset against debt; **no money moves**) |
| `PLAYER_CREDIT_CREATED` / `PLAYER_CREDIT_USED` | ± player credit |
| `CASH_DRAWER_DEPOSIT` / `CASH_DRAWER_WITHDRAWAL` | ± physical drawer |
| `EXPENSE` | money out (drawer only when method = CASH) |
| `ADJUSTMENT` | manual ± debt/credit with `metadata.adjustment {target, sign}`; manager+, reason required |
| `REVERSAL` | audit marker referencing a voided row |

**Compound commands** (one user action → several rows, one `LedgerBatch`):

- *Buy-in*: `SESSION_BUY_IN` + optional `PAYMENT_RECEIVED` + optional `PLAYER_CREDIT_USED` + `DEBT_CREATED` for the remainder.
  Invariant: **chips = paid + creditUsed + debt** (verified per batch).
- *Cash-out*: `CHIPS_RETURNED` + optional `CASHOUT_APPLIED_TO_DEBT` + optional `CASH_PAID_TO_PLAYER` (cash and/or non-cash) + optional `PLAYER_CREDIT_CREATED`.
  Invariant: **chipsReturned = toDebt + paidOut + creditCreated** (verified per batch).

## 3. Balance definitions

For player *P* in session *S* (only `ACTIVE` rows count; `REVERSED` rows and `REVERSAL` markers are excluded):

```
chipsIssued        = Σ SESSION_BUY_IN + SESSION_REBUY
paymentsReceived   = Σ PAYMENT_RECEIVED + Σ DEBT_PAYMENT           (money in from P during S)
chipsReturned      = Σ CHIPS_RETURNED
cashPaidToPlayer   = Σ CASH_PAID_TO_PLAYER                          (any method)
playerPosition     = chipsReturned − chipsIssued                    (game result: + won / − lost)
unsettledChips     = max(0, chipsIssued − chipsReturned)            (must be 0 or declared lost at exit)
sessionDebt(S)     = Σ DEBT_CREATED in S − Σ allocation.toSessionDebt of reducers in S
globalDebt         = Σ DEBT_CREATED − Σ DEBT_PAYMENT − Σ CASHOUT_APPLIED_TO_DEBT ± debt ADJUSTMENTs
historicalDebt(S)  = globalDebt − sessionDebt(S)
credit             = Σ PLAYER_CREDIT_CREATED − Σ PLAYER_CREDIT_USED ± credit ADJUSTMENTs
```

Debt-reducing rows carry `metadata.allocation = { toSessionDebt, toHistoricalDebt }`, and the sum of the allocation always equals the row amount (enforced and re-verified).

## 4. Cash drawer

Only **CASH** touches the physical drawer:

```
expectedCash = openingCash
             + PAYMENT_RECEIVED(CASH) + DEBT_PAYMENT(CASH) + CASH_DRAWER_DEPOSIT
             − CASH_PAID_TO_PLAYER(CASH) − EXPENSE(CASH) − CASH_DRAWER_WITHDRAWAL
```

Bit / bank transfer / card payments increase *payments received* but never the drawer. Closing compares counted vs. expected; a non-zero difference demands a written explanation and is preserved forever in the closing snapshot.
By default the drawer may not go negative (cash-outs and withdrawals are blocked beyond the drawer’s contents; configurable).

## 5. Cash-out settlement strategies

1. **קיזוז חוב קודם (default)** — returned chips first reduce the current session debt, then historical debt (configurable), remainder paid in cash.
2. **תשלום מלא לשחקן** — full amount paid out; debt untouched. Requires manager approval when debt exists (configurable).
3. **חלוקה ידנית** — explicit split across session debt / historical debt / cash / non-cash / credit. Must equal the returned value **exactly**; cannot exceed the respective open debts; no negative parts.

Partial cash-outs and rebuys after cash-outs are fully supported.

## 6. Worked examples (all covered by automated tests)

**A — clean win**: chips 500, paid 500, returned 900, paid out 900 → result **+400**, debt **0**.

**B — partial payment, cash-out to debt**: chips 2,000, paid 500 → debt 1,500. Cash-out 1,200 applied to debt → **no cash paid**, debt **300**, result **−800**.

**C — unpaid buy-in, big win**: chips 2,000 unpaid → debt 2,000. Returns 3,000 → 2,000 clears the debt, **1,000 paid in cash**, debt **0**, result **+1,000**.

**D — historical debt isolation**: prior debt 1,000. New session: buys 500, pays 500, loses all chips. Session settles clean; historical debt remains **exactly 1,000** — it is never recomputed, merged or overwritten by later sessions.

## 7. Payments and credit

- Standalone payments reduce debt oldest-first by default (configurable: session-first / historical-only / manual).
- A payment exceeding open debt **never silently becomes credit** — the operator must explicitly confirm credit creation.
- Credit can fund buy-ins (`PLAYER_CREDIT_USED`) and is created from cash-outs or payment excess only by explicit choice.

## 8. Reversals (voids)

- The original row is **never deleted**: it is marked `REVERSED` with who/when/why, and a `REVERSAL` marker row references it.
- A reason is mandatory. Operators need inline manager approval (per settings); managers/owners act directly — always audited.
- Double reversal is impossible (already-reversed rows are rejected; `verify-ledger` also detects it).
- Reversing a batch voids all of its rows together, keeping the batch invariants intact.

## 9. Sessions

- Only OPEN / REOPENED / CLOSING sessions accept financial rows. CLOSED sessions are read-only.
- A player cannot exit with unreturned chips unless they are explicitly declared lost ("אין צ׳יפים להחזרה").
- Closing requires: all players exited, counted cash entered, explanation for any difference, and the closer’s password/PIN. An immutable `ClosingSnapshot` is stored; re-closing after a reopen appends a new snapshot, never replacing the original.

## 10. Integrity verification

`npm run verify-ledger` recomputes **everything** above from the raw ledger and exits non-zero on: cached balance mismatches, broken batch invariants, broken reversal links, double reversals, allocation mismatches, negative derived balances, drawer expectation mismatches, or unexplained closing differences.
