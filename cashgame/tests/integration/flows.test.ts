import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { createWorld, createTestPlayer, idem, ILS, PASSWORDS, type TestWorld } from "./helpers";
import {
  openSession,
  addPlayerToSession,
  exitPlayer,
  closeSession,
  reopenSession,
  getSessionState,
  buildSessionReportData,
} from "@/server/services/sessions";
import { recordBuyIn, recordPayment, recordCashOut, recordDrawerOp, reverseTransactions } from "@/server/services/ledger";
import { sessionReportXlsx } from "@/server/reports/builders";
import type { Tx } from "@/server/db";

let world: TestWorld;

beforeAll(async () => {
  world = await createWorld();
});

describe("full session lifecycle", () => {
  it("open → add → buy-in → payment → cash-out → exit → close → reopen → reverse", async () => {
    const player = await createTestPlayer(world.orgId, "אבי בדיקה");
    const session = await openSession(world.manager, {
      name: "סשן בדיקות",
      openingCashAmount: ILS(5000),
    });

    await addPlayerToSession(world.operator, {
      idempotencyKey: idem(),
      sessionId: session.id,
      playerId: player.id,
    });

    // Buy-in 2000, paid 500 cash → debt 1500 (spec Example B)
    const buyIn = await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: session.id,
      playerId: player.id,
      chipAmount: ILS(2000),
      paidNow: ILS(500),
      paymentMethod: "CASH",
    });
    expect(buyIn.result.debtCreated).toBe(ILS(1500));
    expect(buyIn.result.after.sessionDebt).toBe(ILS(1500));

    // Standalone payment of 300 in BIT toward session debt
    const payment = await recordPayment(world.operator, {
      idempotencyKey: idem(),
      sessionId: session.id,
      playerId: player.id,
      amount: ILS(300),
      paymentMethod: "BIT",
      strategy: "SESSION_FIRST",
    });
    expect(payment.result.toSessionDebt).toBe(ILS(300));
    expect(payment.result.after.totalDebt).toBe(ILS(1200));

    // Cash-out 1200, all applied to remaining debt → debt 0, no cash paid
    const cashOut = await recordCashOut(world.operator, {
      idempotencyKey: idem(),
      sessionId: session.id,
      playerId: player.id,
      chipsReturned: ILS(1200),
      strategy: "DEBT_FIRST",
    });
    expect(cashOut.result.toSessionDebt).toBe(ILS(1200));
    expect(cashOut.result.cashPaid).toBe(0);
    expect(cashOut.result.after.totalDebt).toBe(0);
    expect(cashOut.result.playerPosition).toBe(ILS(-800));

    // Exit: 800 unsettled chips must be declared lost
    await expect(
      exitPlayer(world.operator, { sessionId: session.id, playerId: player.id }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await exitPlayer(world.operator, {
      sessionId: session.id,
      playerId: player.id,
      declareNoChips: true,
    });

    // Expected cash: 5000 + 500 = 5500 (BIT does not touch the drawer)
    const state = await getSessionState(world.orgId, session.id);
    expect(state.expectedCash).toBe(ILS(5500));
    expect(state.totals.paymentsIn.BIT).toBe(ILS(300));

    // Close with exact count → zero difference
    const closed = await closeSession(world.manager, {
      sessionId: session.id,
      countedClosingCashAmount: ILS(5500),
      credential: PASSWORDS.manager,
    });
    expect(closed.difference).toBe(0);
    expect(closed.session.status).toBe("CLOSED");

    // Closed session rejects ordinary transactions
    await expect(
      recordBuyIn(world.operator, {
        idempotencyKey: idem(),
        sessionId: session.id,
        playerId: player.id,
        chipAmount: ILS(100),
        paidNow: ILS(100),
        paymentMethod: "CASH",
      }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_OPEN" });

    // Reopen (manager, with reason) then reverse the payment batch
    await reopenSession(world.manager, { sessionId: session.id, reason: "תיקון רישום" });
    const reversal = await reverseTransactions(world.manager, {
      idempotencyKey: idem(),
      batchId: payment.result.batchId,
      reason: "נרשם בטעות",
    });
    expect(reversal.result.reversedTransactionIds.length).toBeGreaterThan(0);

    // Debt returns after the 300 payment is voided: cash-out already consumed 1200,
    // so remaining session debt = 1500 - 1200 = 300.
    const player2 = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(player2.currentDebt).toBe(ILS(300));

    // The original rows remain, marked REVERSED, with REVERSAL markers linked.
    const reversed = await prisma.ledgerTransaction.findMany({
      where: { batchId: payment.result.batchId },
    });
    expect(reversed.every((t) => t.status === "REVERSED")).toBe(true);
    const markers = await prisma.ledgerTransaction.findMany({
      where: { referenceTransactionId: { in: reversed.map((t) => t.id) } },
    });
    expect(markers).toHaveLength(reversed.length);

    // Audit log recorded the reversal with its reason
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: world.orgId, action: "REVERSAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.reason).toBe("נרשם בטעות");
  });

  it("Example D: historical debt survives a clean later session", async () => {
    const player = await createTestPlayer(world.orgId, "דוד היסטורי");
    // Session 1: unpaid 1000 buy-in, lost everything
    const s1 = await openSession(world.manager, { name: "סשן ישן", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s1.id, playerId: player.id });
    await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: s1.id,
      playerId: player.id,
      chipAmount: ILS(1000),
      paidNow: 0,
    });
    await exitPlayer(world.operator, { sessionId: s1.id, playerId: player.id, declareNoChips: true });
    await closeSession(world.manager, { sessionId: s1.id, countedClosingCashAmount: 0, credential: PASSWORDS.manager });

    // Session 2: buys 500, pays 500, loses all chips — fully settled
    const s2 = await openSession(world.manager, { name: "סשן חדש", openingCashAmount: ILS(1000) });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s2.id, playerId: player.id });
    await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: s2.id,
      playerId: player.id,
      chipAmount: ILS(500),
      paidNow: ILS(500),
      paymentMethod: "CASH",
    });
    const state = await getSessionState(world.orgId, s2.id);
    const p = state.players.find((x) => x.playerId === player.id)!;
    expect(p.debt.sessionDebt).toBe(0);
    expect(p.debt.historicalDebt).toBe(ILS(1000));
    expect(p.debt.totalDebt).toBe(ILS(1000));

    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(fresh.currentDebt).toBe(ILS(1000));
  });

  it("Example C: split cash-out pays debt then cash", async () => {
    const player = await createTestPlayer(world.orgId, "גדי מנצח");
    const s = await openSession(world.manager, { name: "סשן ניצחון", openingCashAmount: ILS(3000) });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });
    await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      playerId: player.id,
      chipAmount: ILS(2000),
      paidNow: 0,
    });
    const res = await recordCashOut(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      playerId: player.id,
      chipsReturned: ILS(3000),
      strategy: "DEBT_FIRST",
    });
    expect(res.result.toSessionDebt).toBe(ILS(2000));
    expect(res.result.cashPaid).toBe(ILS(1000));
    expect(res.result.after.totalDebt).toBe(0);
    expect(res.result.playerPosition).toBe(ILS(1000));
  });
});

describe("idempotency and transaction safety", () => {
  it("duplicate idempotency key executes the command exactly once", async () => {
    const player = await createTestPlayer(world.orgId, "כפול אחד");
    const s = await openSession(world.manager, { name: "סשן כפילויות", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });

    const key = idem();
    const input = {
      idempotencyKey: key,
      sessionId: s.id,
      playerId: player.id,
      chipAmount: ILS(500),
      paidNow: ILS(500),
      paymentMethod: "CASH" as const,
    };
    const first = await recordBuyIn(world.operator, input);
    const second = await recordBuyIn(world.operator, input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const rows = await prisma.ledgerTransaction.findMany({
      where: { sessionId: s.id, playerId: player.id },
    });
    expect(rows).toHaveLength(2); // one SESSION_BUY_IN + one PAYMENT_RECEIVED
  });

  it("concurrent duplicates create only one batch", async () => {
    const player = await createTestPlayer(world.orgId, "כפול שניים");
    const s = await openSession(world.manager, { name: "סשן מרוץ", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });

    const key = idem();
    const input = {
      idempotencyKey: key,
      sessionId: s.id,
      playerId: player.id,
      chipAmount: ILS(300),
      paidNow: 0,
    };
    const results = await Promise.all([
      recordBuyIn(world.operator, input),
      recordBuyIn(world.operator, input),
      recordBuyIn(world.operator, input),
    ]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    const batches = await prisma.ledgerBatch.findMany({ where: { idempotencyKey: key } });
    expect(batches).toHaveLength(1);
  });

  it("a failing command rolls back the whole batch (no partial rows)", async () => {
    const player = await createTestPlayer(world.orgId, "רולבק");
    const s = await openSession(world.manager, { name: "סשן רולבק", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });

    const key = idem();
    // MANUAL cash-out whose allocation doesn't sum to chipsReturned → server rejects
    await expect(
      recordCashOut(world.operator, {
        idempotencyKey: key,
        sessionId: s.id,
        playerId: player.id,
        chipsReturned: ILS(1000),
        strategy: "MANUAL",
        manual: { toSessionDebt: 0, toHistoricalDebt: 0, cashPaid: ILS(400), nonCashPaid: 0, toCredit: 0 },
      }),
    ).rejects.toBeInstanceOf(AppError);

    // Nothing persisted: no batch, no transactions
    expect(await prisma.ledgerBatch.findUnique({ where: { idempotencyKey: key } })).toBeNull();
    expect(
      await prisma.ledgerTransaction.count({ where: { sessionId: s.id, type: "CHIPS_RETURNED" } }),
    ).toBe(0);
  });

  it("cash-out cannot exceed available drawer cash", async () => {
    const player = await createTestPlayer(world.orgId, "קופה ריקה");
    const s = await openSession(world.manager, { name: "סשן קופה ריקה", openingCashAmount: ILS(100) });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });
    await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      playerId: player.id,
      chipAmount: ILS(500),
      paidNow: ILS(500),
      paymentMethod: "BIT", // no cash into the drawer
    });
    await expect(
      recordCashOut(world.operator, {
        idempotencyKey: idem(),
        sessionId: s.id,
        playerId: player.id,
        chipsReturned: ILS(500),
        strategy: "DEBT_FIRST",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("cash drawer operations", () => {
  it("deposits, withdrawals and expenses move only cash", async () => {
    const s = await openSession(world.manager, { name: "סשן קופה", openingCashAmount: ILS(1000) });
    await recordDrawerOp(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      kind: "DEPOSIT",
      amount: ILS(500),
      reason: "הוספת קופה",
    });
    await recordDrawerOp(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      kind: "EXPENSE",
      amount: ILS(200),
      reason: "פיצה",
      paymentMethod: "CASH",
    });
    await recordDrawerOp(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      kind: "EXPENSE",
      amount: ILS(300),
      reason: "משלוח באשראי",
      paymentMethod: "CREDIT_CARD",
    });
    const state = await getSessionState(world.orgId, s.id);
    // 1000 + 500 - 200 (cash expense only)
    expect(state.expectedCash).toBe(ILS(1300));
    expect(state.totals.expensesTotal).toBe(ILS(500));

    // Withdrawal below zero is rejected
    await expect(
      recordDrawerOp(world.operator, {
        idempotencyKey: idem(),
        sessionId: s.id,
        kind: "WITHDRAWAL",
        amount: ILS(5000),
        reason: "משיכה גדולה מדי",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("closing with a difference requires an explanation and lands in the report", async () => {
    const s = await openSession(world.manager, { name: "סשן הפרש", openingCashAmount: ILS(1000) });
    await expect(
      closeSession(world.manager, {
        sessionId: s.id,
        countedClosingCashAmount: ILS(950),
        credential: PASSWORDS.manager,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });

    const closed = await closeSession(world.manager, {
      sessionId: s.id,
      countedClosingCashAmount: ILS(950),
      differenceExplanation: "חוסר קטן בספירה",
      credential: PASSWORDS.manager,
    });
    expect(closed.difference).toBe(ILS(-50));

    const report = await buildSessionReportData(prisma as unknown as Tx, world.orgId, s.id);
    expect(report.reconciliationDifference).toBe(ILS(-50));
    expect(report.differenceExplanation).toBe("חוסר קטן בספירה");

    // Export works and produces a real XLSX buffer
    const xlsx = await sessionReportXlsx(report);
    expect(xlsx.length).toBeGreaterThan(1000);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});
