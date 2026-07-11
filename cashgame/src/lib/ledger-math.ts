/**
 * Pure ledger computations.
 *
 * Every balance in the system is DERIVED from the append-only ledger by the
 * functions in this file. They are pure (no I/O) so they can be unit-tested
 * exhaustively and reused by the API, the UI, reports, the closing snapshot
 * and the `verify-ledger` integrity checker.
 *
 * Rules:
 *  - Transactions with status REVERSED are excluded from all balances.
 *  - REVERSAL rows are audit markers only and never affect balances.
 *  - Debt-reducing transactions (DEBT_PAYMENT, CASHOUT_APPLIED_TO_DEBT and
 *    negative debt ADJUSTMENTs) carry an allocation in metadata:
 *      { allocation: { toSessionDebt: number; toHistoricalDebt: number } }
 *    "session debt" refers to debt created in the transaction's own sessionId.
 */

import { sumAgorot } from "@/lib/money";

// Structural types so this module works with Prisma rows and test fixtures alike.
export type TxType =
  | "SESSION_BUY_IN"
  | "SESSION_REBUY"
  | "PAYMENT_RECEIVED"
  | "CHIPS_RETURNED"
  | "CASH_PAID_TO_PLAYER"
  | "DEBT_CREATED"
  | "DEBT_PAYMENT"
  | "CASHOUT_APPLIED_TO_DEBT"
  | "PLAYER_CREDIT_CREATED"
  | "PLAYER_CREDIT_USED"
  | "CASH_DRAWER_DEPOSIT"
  | "CASH_DRAWER_WITHDRAWAL"
  | "EXPENSE"
  | "ADJUSTMENT"
  | "REVERSAL";

export type PayMethod = "CASH" | "BIT" | "BANK_TRANSFER" | "CREDIT_CARD" | "OTHER" | "UNPAID";

export interface LedgerTx {
  id: string;
  sessionId: string | null;
  playerId: string | null;
  type: TxType;
  amount: number; // agorot, >= 0
  paymentMethod: PayMethod | null;
  status: "ACTIVE" | "REVERSED";
  metadata?: unknown;
  createdAt: Date;
}

export interface DebtAllocation {
  toSessionDebt: number;
  toHistoricalDebt: number;
}

export interface AdjustmentMeta {
  target: "DEBT" | "CREDIT";
  /** +1 increases the target balance, -1 decreases it. */
  sign: 1 | -1;
}

export function getAllocation(tx: LedgerTx): DebtAllocation {
  const meta = tx.metadata as { allocation?: Partial<DebtAllocation> } | null | undefined;
  const alloc = meta?.allocation;
  return {
    toSessionDebt: alloc?.toSessionDebt ?? 0,
    toHistoricalDebt: alloc?.toHistoricalDebt ?? 0,
  };
}

export function getAdjustmentMeta(tx: LedgerTx): AdjustmentMeta | null {
  const meta = tx.metadata as { adjustment?: AdjustmentMeta } | null | undefined;
  if (!meta?.adjustment) return null;
  return meta.adjustment;
}

/** Transactions that count toward balances. */
export function effective(txs: LedgerTx[]): LedgerTx[] {
  return txs.filter((t) => t.status === "ACTIVE" && t.type !== "REVERSAL");
}

function sumWhere(txs: LedgerTx[], pred: (t: LedgerTx) => boolean): number {
  return sumAgorot(txs.filter(pred).map((t) => t.amount));
}

// ---------------------------------------------------------------------------
// Player × session statistics
// ---------------------------------------------------------------------------

export interface PlayerSessionStats {
  chipsIssued: number;
  paymentsReceived: number; // all money in from this player in this session (buy-in payments + debt payments)
  chipsReturned: number;
  cashPaidToPlayer: number; // all money out to this player (any method)
  creditUsed: number;
  creditCreated: number;
  debtCreated: number;
  /** Reductions applied to THIS session's debt (from cash-outs and payments inside the session). */
  sessionDebtReduced: number;
  /** Open debt created in this session and not yet reduced. */
  sessionDebtOutstanding: number;
  /**
   * max(0, chipsIssued - chipsReturned): chip value still in the player's
   * hands that must be returned or declared lost before exit. A winning
   * player who returned more than issued has 0 unsettled chips.
   */
  unsettledChips: number;
  /** Game result: chipsReturned - chipsIssued. Positive = player won. */
  playerPosition: number;
  lastActivityAt: Date | null;
}

/** Compute a single player's statistics inside a single session. */
export function computePlayerSessionStats(
  txs: LedgerTx[],
  sessionId: string,
  playerId: string,
): PlayerSessionStats {
  const rows = effective(txs).filter((t) => t.sessionId === sessionId && t.playerId === playerId);

  const chipsIssued = sumWhere(rows, (t) => t.type === "SESSION_BUY_IN" || t.type === "SESSION_REBUY");
  const buyInPayments = sumWhere(rows, (t) => t.type === "PAYMENT_RECEIVED");
  const debtPayments = sumWhere(rows, (t) => t.type === "DEBT_PAYMENT");
  const chipsReturned = sumWhere(rows, (t) => t.type === "CHIPS_RETURNED");
  const cashPaidToPlayer = sumWhere(rows, (t) => t.type === "CASH_PAID_TO_PLAYER");
  const creditUsed = sumWhere(rows, (t) => t.type === "PLAYER_CREDIT_USED");
  const creditCreated = sumWhere(rows, (t) => t.type === "PLAYER_CREDIT_CREATED");
  const debtCreated = sumWhere(rows, (t) => t.type === "DEBT_CREATED");

  // Reductions targeted at THIS session's debt.
  const sessionDebtReduced = sumAgorot(
    rows
      .filter((t) => t.type === "DEBT_PAYMENT" || t.type === "CASHOUT_APPLIED_TO_DEBT")
      .map((t) => getAllocation(t).toSessionDebt),
  );

  const lastActivityAt =
    rows.length === 0
      ? null
      : rows.reduce<Date>((max, t) => (t.createdAt > max ? t.createdAt : max), rows[0].createdAt);

  return {
    chipsIssued,
    paymentsReceived: buyInPayments + debtPayments,
    chipsReturned,
    cashPaidToPlayer,
    creditUsed,
    creditCreated,
    debtCreated,
    sessionDebtReduced,
    sessionDebtOutstanding: debtCreated - sessionDebtReduced,
    unsettledChips: Math.max(0, chipsIssued - chipsReturned),
    playerPosition: chipsReturned - chipsIssued,
    lastActivityAt,
  };
}

// ---------------------------------------------------------------------------
// Player global balances
// ---------------------------------------------------------------------------

export interface PlayerGlobalBalance {
  /** Total open debt across all sessions and manual adjustments. */
  totalDebt: number;
  /** Total unused player credit. */
  totalCredit: number;
}

/** Compute a player's global debt and credit from their entire ledger history. */
export function computePlayerGlobalBalance(txs: LedgerTx[], playerId: string): PlayerGlobalBalance {
  const rows = effective(txs).filter((t) => t.playerId === playerId);

  let debt = 0;
  let credit = 0;
  for (const t of rows) {
    switch (t.type) {
      case "DEBT_CREATED":
        debt += t.amount;
        break;
      case "DEBT_PAYMENT":
      case "CASHOUT_APPLIED_TO_DEBT":
        debt -= t.amount;
        break;
      case "PLAYER_CREDIT_CREATED":
        credit += t.amount;
        break;
      case "PLAYER_CREDIT_USED":
        credit -= t.amount;
        break;
      case "ADJUSTMENT": {
        const adj = getAdjustmentMeta(t);
        if (adj?.target === "DEBT") debt += adj.sign * t.amount;
        if (adj?.target === "CREDIT") credit += adj.sign * t.amount;
        break;
      }
      default:
        break;
    }
  }
  return { totalDebt: debt, totalCredit: credit };
}

/**
 * Split a player's total open debt into "this session" vs "historical"
 * for display during a live session.
 */
export function splitPlayerDebt(
  txs: LedgerTx[],
  sessionId: string,
  playerId: string,
): { sessionDebt: number; historicalDebt: number; totalDebt: number } {
  const { totalDebt } = computePlayerGlobalBalance(txs, playerId);
  const stats = computePlayerSessionStats(txs, sessionId, playerId);
  const sessionDebt = stats.sessionDebtOutstanding;
  return { sessionDebt, historicalDebt: totalDebt - sessionDebt, totalDebt };
}

// ---------------------------------------------------------------------------
// Session totals
// ---------------------------------------------------------------------------

export interface MethodBreakdown {
  CASH: number;
  BIT: number;
  BANK_TRANSFER: number;
  CREDIT_CARD: number;
  OTHER: number;
}

export function emptyBreakdown(): MethodBreakdown {
  return { CASH: 0, BIT: 0, BANK_TRANSFER: 0, CREDIT_CARD: 0, OTHER: 0 };
}

export interface SessionTotals {
  chipsIssued: number;
  chipsReturned: number;
  chipsOutstanding: number;
  /** Money received from players (buy-in payments + debt payments in this session), by method. */
  paymentsIn: MethodBreakdown;
  paymentsInTotal: number;
  /** Money paid out to players, by method. */
  paidOut: MethodBreakdown;
  paidOutTotal: number;
  debtCreated: number;
  debtCollected: number; // full amounts of debt-reducing txs recorded in this session
  creditCreated: number;
  creditUsed: number;
  drawerDeposits: number;
  drawerWithdrawals: number;
  cashExpenses: number;
  expensesTotal: number;
  unpaidBuyIns: number; // chips issued not covered by immediate payment or credit
}

export function computeSessionTotals(txs: LedgerTx[], sessionId: string): SessionTotals {
  const rows = effective(txs).filter((t) => t.sessionId === sessionId);

  const paymentsIn = emptyBreakdown();
  const paidOut = emptyBreakdown();
  let chipsIssued = 0;
  let chipsReturned = 0;
  let debtCreated = 0;
  let debtCollected = 0;
  let creditCreated = 0;
  let creditUsed = 0;
  let drawerDeposits = 0;
  let drawerWithdrawals = 0;
  let cashExpenses = 0;
  let expensesTotal = 0;

  const addMethod = (b: MethodBreakdown, method: PayMethod | null, amount: number) => {
    const key = method && method !== "UNPAID" ? method : "OTHER";
    b[key] += amount;
  };

  for (const t of rows) {
    switch (t.type) {
      case "SESSION_BUY_IN":
      case "SESSION_REBUY":
        chipsIssued += t.amount;
        break;
      case "CHIPS_RETURNED":
        chipsReturned += t.amount;
        break;
      case "PAYMENT_RECEIVED":
      case "DEBT_PAYMENT":
        addMethod(paymentsIn, t.paymentMethod, t.amount);
        if (t.type === "DEBT_PAYMENT") debtCollected += t.amount;
        break;
      case "CASH_PAID_TO_PLAYER":
        addMethod(paidOut, t.paymentMethod ?? "CASH", t.amount);
        break;
      case "DEBT_CREATED":
        debtCreated += t.amount;
        break;
      case "CASHOUT_APPLIED_TO_DEBT":
        debtCollected += t.amount;
        break;
      case "PLAYER_CREDIT_CREATED":
        creditCreated += t.amount;
        break;
      case "PLAYER_CREDIT_USED":
        creditUsed += t.amount;
        break;
      case "CASH_DRAWER_DEPOSIT":
        drawerDeposits += t.amount;
        break;
      case "CASH_DRAWER_WITHDRAWAL":
        drawerWithdrawals += t.amount;
        break;
      case "EXPENSE":
        expensesTotal += t.amount;
        if ((t.paymentMethod ?? "CASH") === "CASH") cashExpenses += t.amount;
        break;
      default:
        break;
    }
  }

  const paymentsInTotal = sumAgorot(Object.values(paymentsIn));
  const paidOutTotal = sumAgorot(Object.values(paidOut));

  return {
    chipsIssued,
    chipsReturned,
    chipsOutstanding: chipsIssued - chipsReturned,
    paymentsIn,
    paymentsInTotal,
    paidOut,
    paidOutTotal,
    debtCreated,
    debtCollected,
    creditCreated,
    creditUsed,
    drawerDeposits,
    drawerWithdrawals,
    cashExpenses,
    expensesTotal,
    unpaidBuyIns: debtCreated,
  };
}

/**
 * Expected physical cash in the drawer.
 * Only CASH transactions move the physical drawer:
 *   opening + cash in (payments + debt payments + deposits)
 *           - cash out (paid to players + cash expenses + withdrawals)
 */
export function computeExpectedCash(
  txs: LedgerTx[],
  sessionId: string,
  openingCashAmount: number,
): number {
  const totals = computeSessionTotals(txs, sessionId);
  return (
    openingCashAmount +
    totals.paymentsIn.CASH +
    totals.drawerDeposits -
    totals.paidOut.CASH -
    totals.cashExpenses -
    totals.drawerWithdrawals
  );
}

// ---------------------------------------------------------------------------
// Batch invariants (used by verify-ledger and service-layer sanity checks)
// ---------------------------------------------------------------------------

export interface BatchCheckResult {
  ok: boolean;
  problems: string[];
}

/** A buy-in batch must decompose exactly: chips = paid + creditUsed + debt. */
export function checkBuyInBatch(rows: LedgerTx[]): BatchCheckResult {
  const problems: string[] = [];
  const chips = sumWhere(rows, (t) => t.type === "SESSION_BUY_IN" || t.type === "SESSION_REBUY");
  const paid = sumWhere(rows, (t) => t.type === "PAYMENT_RECEIVED");
  const credit = sumWhere(rows, (t) => t.type === "PLAYER_CREDIT_USED");
  const debt = sumWhere(rows, (t) => t.type === "DEBT_CREATED");
  if (chips !== paid + credit + debt) {
    problems.push(`buy-in decomposition broken: chips=${chips} paid=${paid} credit=${credit} debt=${debt}`);
  }
  return { ok: problems.length === 0, problems };
}

/** A cash-out batch must decompose exactly: chipsReturned = toDebt + paidOut + credit. */
export function checkCashOutBatch(rows: LedgerTx[]): BatchCheckResult {
  const problems: string[] = [];
  const returned = sumWhere(rows, (t) => t.type === "CHIPS_RETURNED");
  const toDebt = sumWhere(rows, (t) => t.type === "CASHOUT_APPLIED_TO_DEBT");
  const paidOut = sumWhere(rows, (t) => t.type === "CASH_PAID_TO_PLAYER");
  const credit = sumWhere(rows, (t) => t.type === "PLAYER_CREDIT_CREATED");
  if (returned !== toDebt + paidOut + credit) {
    problems.push(
      `cash-out decomposition broken: returned=${returned} toDebt=${toDebt} paidOut=${paidOut} credit=${credit}`,
    );
  }
  // The allocation metadata must equal the transaction amount.
  for (const t of rows) {
    if (t.type === "CASHOUT_APPLIED_TO_DEBT") {
      const a = getAllocation(t);
      if (a.toSessionDebt + a.toHistoricalDebt !== t.amount) {
        problems.push(`allocation mismatch on ${t.id}: ${JSON.stringify(a)} != amount ${t.amount}`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
