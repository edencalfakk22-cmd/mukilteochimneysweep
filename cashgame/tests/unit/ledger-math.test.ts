import { describe, it, expect } from "vitest";
import {
  computePlayerSessionStats,
  computePlayerGlobalBalance,
  computeSessionTotals,
  computeExpectedCash,
  splitPlayerDebt,
  checkBuyInBatch,
  checkCashOutBatch,
  type LedgerTx,
  type TxType,
  type PayMethod,
} from "@/lib/ledger-math";

let seq = 0;
function tx(partial: {
  type: TxType;
  amount: number;
  sessionId?: string | null;
  playerId?: string | null;
  paymentMethod?: PayMethod | null;
  status?: "ACTIVE" | "REVERSED";
  metadata?: unknown;
}): LedgerTx {
  seq += 1;
  return {
    id: `t${seq}`,
    sessionId: partial.sessionId === undefined ? "s1" : partial.sessionId,
    playerId: partial.playerId === undefined ? "p1" : partial.playerId,
    type: partial.type,
    amount: partial.amount,
    paymentMethod: partial.paymentMethod ?? null,
    status: partial.status ?? "ACTIVE",
    metadata: partial.metadata,
    createdAt: new Date(2026, 0, 1, 12, 0, seq),
  };
}

const ILS = (n: number) => n * 100; // shekels -> agorot for readable tests

describe("Spec Example A: paid buy-in, winning cash-out", () => {
  // Chips issued 500, paid 500, chips returned 900, cash paid 900.
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(500) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(500), paymentMethod: "CASH" }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(900) }),
    tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(900), paymentMethod: "CASH" }),
  ];

  it("game result +400, no debt", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.playerPosition).toBe(ILS(400));
    expect(s.sessionDebtOutstanding).toBe(0);
    expect(s.chipsIssued).toBe(ILS(500));
    expect(s.paymentsReceived).toBe(ILS(500));
    expect(s.chipsReturned).toBe(ILS(900));
    expect(s.cashPaidToPlayer).toBe(ILS(900));
    expect(s.unsettledChips).toBe(0);
    const g = computePlayerGlobalBalance(txs, "p1");
    expect(g.totalDebt).toBe(0);
  });
});

describe("Spec Example B: partial payment, cash-out applied to debt", () => {
  // Chips 2000, paid 500 -> debt 1500. Cash-out 1200 all applied to debt.
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(2000) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(500), paymentMethod: "CASH" }),
    tx({ type: "DEBT_CREATED", amount: ILS(1500) }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(1200) }),
    tx({
      type: "CASHOUT_APPLIED_TO_DEBT",
      amount: ILS(1200),
      metadata: { allocation: { toSessionDebt: ILS(1200), toHistoricalDebt: 0 } },
    }),
  ];

  it("debt becomes 300, no cash paid, result -800", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.sessionDebtOutstanding).toBe(ILS(300));
    expect(s.cashPaidToPlayer).toBe(0);
    expect(s.playerPosition).toBe(ILS(-800));
    const g = computePlayerGlobalBalance(txs, "p1");
    expect(g.totalDebt).toBe(ILS(300));
  });
});

describe("Spec Example C: unpaid buy-in, big win, split settlement", () => {
  // Chips 2000 unpaid. Returns 3000. 2000 to debt, 1000 cash.
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(2000) }),
    tx({ type: "DEBT_CREATED", amount: ILS(2000) }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(3000) }),
    tx({
      type: "CASHOUT_APPLIED_TO_DEBT",
      amount: ILS(2000),
      metadata: { allocation: { toSessionDebt: ILS(2000), toHistoricalDebt: 0 } },
    }),
    tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(1000), paymentMethod: "CASH" }),
  ];

  it("debt 0, result +1000", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.sessionDebtOutstanding).toBe(0);
    expect(s.playerPosition).toBe(ILS(1000));
    expect(s.cashPaidToPlayer).toBe(ILS(1000));
    expect(computePlayerGlobalBalance(txs, "p1").totalDebt).toBe(0);
  });
});

describe("Spec Example D: historical debt untouched by a settled session", () => {
  // Old session s0 left debt 1000. New session s1: buy 500, pay 500, lose all chips.
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(1000), sessionId: "s0" }),
    tx({ type: "DEBT_CREATED", amount: ILS(1000), sessionId: "s0" }),
    tx({ type: "SESSION_BUY_IN", amount: ILS(500) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(500), paymentMethod: "CASH" }),
    // player lost all chips: no CHIPS_RETURNED
  ];

  it("historical debt remains exactly 1000", () => {
    const split = splitPlayerDebt(txs, "s1", "p1");
    expect(split.sessionDebt).toBe(0);
    expect(split.historicalDebt).toBe(ILS(1000));
    expect(split.totalDebt).toBe(ILS(1000));
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.playerPosition).toBe(ILS(-500));
    expect(s.unsettledChips).toBe(ILS(500));
  });
});

describe("multiple rebuys and payments", () => {
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(500) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(500), paymentMethod: "CASH" }),
    tx({ type: "SESSION_REBUY", amount: ILS(500) }),
    tx({ type: "DEBT_CREATED", amount: ILS(500) }),
    tx({ type: "SESSION_REBUY", amount: ILS(1000) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(400), paymentMethod: "BIT" }),
    tx({ type: "DEBT_CREATED", amount: ILS(600) }),
    // standalone debt payment during session, applied to session debt
    tx({
      type: "DEBT_PAYMENT",
      amount: ILS(300),
      paymentMethod: "CASH",
      metadata: { allocation: { toSessionDebt: ILS(300), toHistoricalDebt: 0 } },
    }),
  ];

  it("aggregates chips, payments and debt correctly", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.chipsIssued).toBe(ILS(2000));
    expect(s.paymentsReceived).toBe(ILS(1200));
    expect(s.debtCreated).toBe(ILS(1100));
    expect(s.sessionDebtOutstanding).toBe(ILS(800));
    expect(computePlayerGlobalBalance(txs, "p1").totalDebt).toBe(ILS(800));
  });
});

describe("credit creation and usage", () => {
  const txs = [
    tx({ type: "PLAYER_CREDIT_CREATED", amount: ILS(200) }),
    tx({ type: "SESSION_BUY_IN", amount: ILS(500) }),
    tx({ type: "PLAYER_CREDIT_USED", amount: ILS(200) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(300), paymentMethod: "CASH" }),
  ];

  it("tracks credit balance", () => {
    const g = computePlayerGlobalBalance(txs, "p1");
    expect(g.totalCredit).toBe(0);
    expect(g.totalDebt).toBe(0);
  });

  it("buy-in decomposition with credit is valid", () => {
    const batch = txs.slice(1);
    expect(checkBuyInBatch(batch).ok).toBe(true);
  });
});

describe("reversals", () => {
  const original = tx({ type: "SESSION_BUY_IN", amount: ILS(1000), status: "REVERSED" });
  const debt = tx({ type: "DEBT_CREATED", amount: ILS(1000), status: "REVERSED" });
  const reversal = tx({ type: "REVERSAL", amount: ILS(1000) });
  const txs = [original, debt, reversal];

  it("reversed transactions and REVERSAL markers do not affect balances", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.chipsIssued).toBe(0);
    expect(computePlayerGlobalBalance(txs, "p1").totalDebt).toBe(0);
  });
});

describe("manual adjustments", () => {
  const txs = [
    tx({ type: "DEBT_CREATED", amount: ILS(500), sessionId: null }),
    tx({
      type: "ADJUSTMENT",
      amount: ILS(100),
      sessionId: null,
      metadata: { adjustment: { target: "DEBT", sign: -1 } },
    }),
    tx({
      type: "ADJUSTMENT",
      amount: ILS(50),
      sessionId: null,
      metadata: { adjustment: { target: "CREDIT", sign: 1 } },
    }),
  ];

  it("adjustments move debt and credit with explicit sign", () => {
    const g = computePlayerGlobalBalance(txs, "p1");
    expect(g.totalDebt).toBe(ILS(400));
    expect(g.totalCredit).toBe(ILS(50));
  });
});

describe("session totals and payment-method separation", () => {
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(1000), playerId: "p1" }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(600), paymentMethod: "CASH", playerId: "p1" }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(400), paymentMethod: "BIT", playerId: "p1" }),
    tx({ type: "SESSION_BUY_IN", amount: ILS(2000), playerId: "p2" }),
    tx({ type: "DEBT_CREATED", amount: ILS(2000), playerId: "p2" }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(500), playerId: "p1" }),
    tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(500), paymentMethod: "CASH", playerId: "p1" }),
    tx({ type: "EXPENSE", amount: ILS(100), paymentMethod: "CASH", playerId: null }),
    tx({ type: "EXPENSE", amount: ILS(80), paymentMethod: "CREDIT_CARD", playerId: null }),
    tx({ type: "CASH_DRAWER_DEPOSIT", amount: ILS(1000), playerId: null }),
    tx({ type: "CASH_DRAWER_WITHDRAWAL", amount: ILS(300), playerId: null }),
  ];

  it("separates methods and computes totals", () => {
    const t = computeSessionTotals(txs, "s1");
    expect(t.chipsIssued).toBe(ILS(3000));
    expect(t.chipsReturned).toBe(ILS(500));
    expect(t.chipsOutstanding).toBe(ILS(2500));
    expect(t.paymentsIn.CASH).toBe(ILS(600));
    expect(t.paymentsIn.BIT).toBe(ILS(400));
    expect(t.paymentsInTotal).toBe(ILS(1000));
    expect(t.debtCreated).toBe(ILS(2000));
    expect(t.paidOut.CASH).toBe(ILS(500));
    expect(t.cashExpenses).toBe(ILS(100));
    expect(t.expensesTotal).toBe(ILS(180));
  });

  it("expected cash counts only CASH movements", () => {
    // opening 5000 + cash 600 + deposit 1000 - paid 500 - cash expense 100 - withdrawal 300
    expect(computeExpectedCash(txs, "s1", ILS(5000))).toBe(ILS(5700));
  });

  it("Bit payments do not move the drawer", () => {
    const onlyBit = [tx({ type: "PAYMENT_RECEIVED", amount: ILS(999), paymentMethod: "BIT" })];
    expect(computeExpectedCash(onlyBit, "s1", ILS(100))).toBe(ILS(100));
  });
});

describe("batch invariants", () => {
  it("detects broken buy-in decomposition", () => {
    const bad = [
      tx({ type: "SESSION_BUY_IN", amount: ILS(1000) }),
      tx({ type: "PAYMENT_RECEIVED", amount: ILS(300), paymentMethod: "CASH" }),
      // missing DEBT_CREATED of 700
    ];
    expect(checkBuyInBatch(bad).ok).toBe(false);
  });

  it("detects broken cash-out allocation", () => {
    const bad = [
      tx({ type: "CHIPS_RETURNED", amount: ILS(1200) }),
      tx({
        type: "CASHOUT_APPLIED_TO_DEBT",
        amount: ILS(1000),
        metadata: { allocation: { toSessionDebt: ILS(900), toHistoricalDebt: 0 } },
      }),
    ];
    const res = checkCashOutBatch(bad);
    expect(res.ok).toBe(false);
    expect(res.problems.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts a correct split cash-out", () => {
    const good = [
      tx({ type: "CHIPS_RETURNED", amount: ILS(3000) }),
      tx({
        type: "CASHOUT_APPLIED_TO_DEBT",
        amount: ILS(2000),
        metadata: { allocation: { toSessionDebt: ILS(1500), toHistoricalDebt: ILS(500) } },
      }),
      tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(800), paymentMethod: "CASH" }),
      tx({ type: "PLAYER_CREDIT_CREATED", amount: ILS(200) }),
    ];
    expect(checkCashOutBatch(good).ok).toBe(true);
  });
});

describe("partial cash-outs and re-buys after cash-out", () => {
  const txs = [
    tx({ type: "SESSION_BUY_IN", amount: ILS(1000) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(1000), paymentMethod: "CASH" }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(400) }),
    tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(400), paymentMethod: "CASH" }),
    tx({ type: "SESSION_REBUY", amount: ILS(500) }),
    tx({ type: "PAYMENT_RECEIVED", amount: ILS(500), paymentMethod: "CASH" }),
    tx({ type: "CHIPS_RETURNED", amount: ILS(800) }),
    tx({ type: "CASH_PAID_TO_PLAYER", amount: ILS(800), paymentMethod: "CASH" }),
  ];

  it("supports multiple cash-outs and rebuys", () => {
    const s = computePlayerSessionStats(txs, "s1", "p1");
    expect(s.chipsIssued).toBe(ILS(1500));
    expect(s.chipsReturned).toBe(ILS(1200));
    expect(s.unsettledChips).toBe(ILS(300));
    expect(s.playerPosition).toBe(ILS(-300));
    expect(s.cashPaidToPlayer).toBe(ILS(1200));
  });
});
