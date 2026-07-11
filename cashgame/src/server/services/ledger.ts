/**
 * Ledger command service.
 *
 * Every user-facing financial action is one command here. Each command:
 *  - validates the actor's role and the session state on the server,
 *  - runs inside a single serializable DB transaction (all-or-nothing),
 *  - is idempotent via a client-supplied idempotency key,
 *  - appends immutable LedgerTransaction rows grouped in a LedgerBatch,
 *  - refreshes the player's cached balances from the ledger,
 *  - writes an audit log entry,
 *  - returns a before/after summary for the confirmation UI.
 */

import type { PaymentMethod, Prisma } from "@prisma/client";
import { assertAgorot } from "@/lib/money";
import {
  computePlayerSessionStats,
  splitPlayerDebt,
  computeExpectedCash,
  type LedgerTx,
} from "@/lib/ledger-math";
import type { Tx } from "@/server/db";
import { Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { requireRole, hasAtLeastRole } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import {
  getWritableSession,
  getSettings,
  recomputePlayerBalance,
  runIdempotent,
  verifyManagerApproval,
  type ManagerApproval,
} from "@/server/services/shared";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function playerLedger(db: Tx, playerId: string): Promise<LedgerTx[]> {
  const rows = await db.ledgerTransaction.findMany({
    where: { playerId },
    orderBy: { createdAt: "asc" },
  });
  return rows as unknown as LedgerTx[];
}

async function getActiveSessionPlayer(db: Tx, sessionId: string, playerId: string) {
  const sp = await db.sessionPlayer.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
    include: { player: true },
  });
  if (!sp) throw Errors.notFound("השחקן אינו משויך לסשן הזה");
  return sp;
}

export interface BalanceSnapshot {
  sessionDebt: number;
  historicalDebt: number;
  totalDebt: number;
  credit: number;
}

async function balancesFor(db: Tx, sessionId: string | null, playerId: string): Promise<BalanceSnapshot> {
  const ledger = await playerLedger(db, playerId);
  if (sessionId) {
    const split = splitPlayerDebt(ledger, sessionId, playerId);
    const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
    return { ...split, credit: player.currentCredit };
  }
  const split = splitPlayerDebt(ledger, "__none__", playerId);
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  return { ...split, credit: player.currentCredit };
}

function requirePayableMethod(method: PaymentMethod | undefined | null): PaymentMethod {
  if (!method || method === "UNPAID") {
    throw Errors.validation("יש לבחור אמצעי תשלום");
  }
  return method;
}

// ---------------------------------------------------------------------------
// Buy-in / Rebuy
// ---------------------------------------------------------------------------

export interface BuyInInput {
  idempotencyKey: string;
  sessionId: string;
  playerId: string;
  chipAmount: number; // agorot
  paidNow: number; // agorot
  paymentMethod?: PaymentMethod | null;
  useCredit?: number; // agorot of existing player credit applied to this buy-in
  notes?: string;
  reference?: string; // receipt / transfer reference
  paidByOther?: string; // free-text "paid by someone else" note
  confirmHighAmount?: boolean;
  confirmOverLimit?: boolean;
  approval?: ManagerApproval; // required when credit limit behavior is BLOCK and limit exceeded
}

export interface BuyInResult {
  batchId: string;
  isRebuy: boolean;
  chipAmount: number;
  paidNow: number;
  creditUsed: number;
  debtCreated: number;
  before: BalanceSnapshot;
  after: BalanceSnapshot;
}

export async function recordBuyIn(actor: Actor, input: BuyInInput): Promise<{ result: BuyInResult; duplicate: boolean }> {
  requireRole(actor, "OPERATOR");
  const chipAmount = assertAgorot(input.chipAmount, "סכום הצ׳יפים");
  const paidNow = assertAgorot(input.paidNow ?? 0, "הסכום ששולם");
  const useCredit = assertAgorot(input.useCredit ?? 0, "יתרת זכות");
  if (chipAmount <= 0) throw Errors.validation("סכום הצ׳יפים חייב להיות גדול מאפס");
  if (paidNow + useCredit > chipAmount) {
    throw Errors.validation("הסכום ששולם גבוה מסכום הקנייה — לרישום פירעון חוב השתמש בפעולת תשלום");
  }
  const method = paidNow > 0 ? requirePayableMethod(input.paymentMethod) : null;

  return runIdempotent(
    input.idempotencyKey,
    "BUY_IN",
    async (db, batchId) => {
      const session = await getWritableSession(db, input.sessionId, actor.organizationId);
      const sp = await getActiveSessionPlayer(db, session.id, input.playerId);
      if (sp.status !== "ACTIVE") throw Errors.validation("השחקן אינו פעיל בסשן — יש להחזירו לפני קנייה");

      const settings = await getSettings(db, actor.organizationId);
      if (chipAmount >= settings.highAmountWarningThreshold && !input.confirmHighAmount) {
        throw Errors.confirmationRequired("סכום גבוה מהרגיל — נדרש אישור מפורש", {
          kind: "HIGH_AMOUNT",
          threshold: settings.highAmountWarningThreshold,
        });
      }

      const before = await balancesFor(db, session.id, input.playerId);
      if (useCredit > before.credit) throw Errors.validation("אין מספיק יתרת זכות לשחקן");

      const debtCreated = chipAmount - paidNow - useCredit;

      // Credit-limit enforcement
      if (debtCreated > 0 && sp.player.creditLimit != null) {
        const newTotalDebt = before.totalDebt + debtCreated;
        if (newTotalDebt > sp.player.creditLimit) {
          if (settings.creditLimitBehavior === "BLOCK") {
            await verifyManagerApproval(db, actor.organizationId, input.approval);
          } else if (!input.confirmOverLimit) {
            throw Errors.confirmationRequired("השחקן חורג ממסגרת האשראי — נדרש אישור מפורש", {
              kind: "OVER_CREDIT_LIMIT",
              creditLimit: sp.player.creditLimit,
              newTotalDebt,
            });
          }
        }
      }

      const priorBuyIn = await db.ledgerTransaction.findFirst({
        where: {
          sessionId: session.id,
          playerId: input.playerId,
          type: { in: ["SESSION_BUY_IN", "SESSION_REBUY"] },
          status: "ACTIVE",
        },
      });
      const isRebuy = priorBuyIn != null;

      const base = {
        organizationId: actor.organizationId,
        sessionId: session.id,
        playerId: input.playerId,
        createdByUserId: actor.userId,
        batchId,
        notes: input.notes || null,
      };

      await db.ledgerTransaction.create({
        data: {
          ...base,
          type: isRebuy ? "SESSION_REBUY" : "SESSION_BUY_IN",
          amount: chipAmount,
          metadata: {
            reference: input.reference || undefined,
            paidByOther: input.paidByOther || undefined,
          } as Prisma.InputJsonValue,
        },
      });
      if (paidNow > 0) {
        await db.ledgerTransaction.create({
          data: { ...base, type: "PAYMENT_RECEIVED", amount: paidNow, paymentMethod: method },
        });
      }
      if (useCredit > 0) {
        await db.ledgerTransaction.create({
          data: { ...base, type: "PLAYER_CREDIT_USED", amount: useCredit },
        });
      }
      if (debtCreated > 0) {
        await db.ledgerTransaction.create({
          data: { ...base, type: "DEBT_CREATED", amount: debtCreated },
        });
      }

      await recomputePlayerBalance(db, input.playerId);
      const after = await balancesFor(db, session.id, input.playerId);

      await writeAudit(db, { ...actor, userId: actor.userId }, {
        action: isRebuy ? "REBUY" : "BUY_IN",
        entityType: "LedgerBatch",
        entityId: batchId,
        after: { chipAmount, paidNow, useCredit, debtCreated, playerId: input.playerId, sessionId: session.id },
      });

      const result: BuyInResult = {
        batchId,
        isRebuy,
        chipAmount,
        paidNow,
        creditUsed: useCredit,
        debtCreated,
        before,
        after,
      };
      return result;
    },
    { sessionId: input.sessionId, playerId: input.playerId, actorUserId: actor.userId },
  );
}

// ---------------------------------------------------------------------------
// Standalone payment (debt repayment, optionally creating credit)
// ---------------------------------------------------------------------------

export type PaymentAllocationStrategy = "SESSION_FIRST" | "OLDEST_FIRST" | "HISTORICAL_ONLY" | "MANUAL";

export interface PaymentInput {
  idempotencyKey: string;
  sessionId?: string | null; // null => recorded from the player profile, outside any session
  playerId: string;
  amount: number; // agorot
  paymentMethod: PaymentMethod;
  strategy?: PaymentAllocationStrategy;
  manual?: { toSessionDebt: number; toHistoricalDebt: number };
  /** Excess beyond open debt becomes player credit only when explicitly allowed. */
  allowCreditCreation?: boolean;
  notes?: string;
}

export interface PaymentResult {
  batchId: string;
  amount: number;
  toSessionDebt: number;
  toHistoricalDebt: number;
  creditCreated: number;
  before: BalanceSnapshot;
  after: BalanceSnapshot;
}

export async function recordPayment(
  actor: Actor,
  input: PaymentInput,
): Promise<{ result: PaymentResult; duplicate: boolean }> {
  requireRole(actor, "OPERATOR");
  const amount = assertAgorot(input.amount, "סכום התשלום");
  if (amount <= 0) throw Errors.validation("סכום התשלום חייב להיות גדול מאפס");
  const method = requirePayableMethod(input.paymentMethod);

  return runIdempotent(
    input.idempotencyKey,
    "PAYMENT",
    async (db, batchId) => {
      let sessionId: string | null = null;
      if (input.sessionId) {
        const session = await getWritableSession(db, input.sessionId, actor.organizationId);
        sessionId = session.id;
      }
      const player = await db.player.findFirst({
        where: { id: input.playerId, organizationId: actor.organizationId },
      });
      if (!player) throw Errors.notFound("השחקן לא נמצא");

      const before = await balancesFor(db, sessionId, input.playerId);

      const strategy = input.strategy ?? "OLDEST_FIRST";
      let toSessionDebt = 0;
      let toHistoricalDebt = 0;

      if (strategy === "MANUAL") {
        if (!input.manual) throw Errors.validation("חסרה חלוקת תשלום ידנית");
        toSessionDebt = assertAgorot(input.manual.toSessionDebt, "קיזוז חוב סשן");
        toHistoricalDebt = assertAgorot(input.manual.toHistoricalDebt, "קיזוז חוב קודם");
        if (toSessionDebt + toHistoricalDebt > amount) {
          throw Errors.validation("סכום החלוקה גבוה מסכום התשלום");
        }
      } else if (strategy === "SESSION_FIRST") {
        toSessionDebt = Math.min(amount, before.sessionDebt);
        toHistoricalDebt = Math.min(amount - toSessionDebt, Math.max(0, before.historicalDebt));
      } else if (strategy === "HISTORICAL_ONLY") {
        toHistoricalDebt = Math.min(amount, Math.max(0, before.historicalDebt));
      } else {
        // OLDEST_FIRST: historical debt predates the current session's debt.
        toHistoricalDebt = Math.min(amount, Math.max(0, before.historicalDebt));
        toSessionDebt = Math.min(amount - toHistoricalDebt, before.sessionDebt);
      }

      if (toSessionDebt > before.sessionDebt || toHistoricalDebt > Math.max(0, before.historicalDebt)) {
        throw Errors.validation("החלוקה גבוהה מהחוב הפתוח");
      }

      const allocated = toSessionDebt + toHistoricalDebt;
      const excess = amount - allocated;
      if (excess > 0 && !input.allowCreditCreation) {
        throw Errors.confirmationRequired("התשלום גבוה מהחוב הפתוח — האם ליצור יתרת זכות לשחקן?", {
          kind: "CREATE_CREDIT",
          excess,
        });
      }

      const base = {
        organizationId: actor.organizationId,
        sessionId,
        playerId: input.playerId,
        createdByUserId: actor.userId,
        batchId,
        notes: input.notes || null,
      };

      if (allocated > 0) {
        await db.ledgerTransaction.create({
          data: {
            ...base,
            type: "DEBT_PAYMENT",
            amount: allocated,
            paymentMethod: method,
            metadata: { allocation: { toSessionDebt, toHistoricalDebt } } as Prisma.InputJsonValue,
          },
        });
      }
      if (excess > 0) {
        await db.ledgerTransaction.create({
          data: {
            ...base,
            type: "PLAYER_CREDIT_CREATED",
            amount: excess,
            paymentMethod: method,
            metadata: { source: "PAYMENT_EXCESS" } as Prisma.InputJsonValue,
          },
        });
      }

      await recomputePlayerBalance(db, input.playerId);
      const after = await balancesFor(db, sessionId, input.playerId);

      await writeAudit(db, actor, {
        action: "DEBT_PAYMENT",
        entityType: "LedgerBatch",
        entityId: batchId,
        after: { amount, toSessionDebt, toHistoricalDebt, creditCreated: excess, playerId: input.playerId },
      });

      const result: PaymentResult = {
        batchId,
        amount,
        toSessionDebt,
        toHistoricalDebt,
        creditCreated: excess,
        before,
        after,
      };
      return result;
    },
    { sessionId: input.sessionId ?? null, playerId: input.playerId, actorUserId: actor.userId },
  );
}

// ---------------------------------------------------------------------------
// Cash-out
// ---------------------------------------------------------------------------

export type CashOutStrategy = "DEBT_FIRST" | "PAY_FULL" | "MANUAL";

export interface CashOutInput {
  idempotencyKey: string;
  sessionId: string;
  playerId: string;
  chipsReturned: number; // agorot
  strategy: CashOutStrategy;
  /** For MANUAL strategy — must sum exactly to chipsReturned. */
  manual?: {
    toSessionDebt: number;
    toHistoricalDebt: number;
    cashPaid: number;
    nonCashPaid: number;
    nonCashMethod?: PaymentMethod;
    toCredit: number;
  };
  notes?: string;
  confirmHighAmount?: boolean;
  approval?: ManagerApproval; // required for PAY_FULL while debt remains (per settings)
}

export interface CashOutResult {
  batchId: string;
  chipsReturned: number;
  toSessionDebt: number;
  toHistoricalDebt: number;
  cashPaid: number;
  nonCashPaid: number;
  creditCreated: number;
  playerPosition: number;
  before: BalanceSnapshot;
  after: BalanceSnapshot;
}

export async function recordCashOut(
  actor: Actor,
  input: CashOutInput,
): Promise<{ result: CashOutResult; duplicate: boolean }> {
  requireRole(actor, "OPERATOR");
  const chipsReturned = assertAgorot(input.chipsReturned, "שווי הצ׳יפים המוחזרים");
  if (chipsReturned <= 0) throw Errors.validation("שווי הצ׳יפים חייב להיות גדול מאפס");

  return runIdempotent(
    input.idempotencyKey,
    "CASH_OUT",
    async (db, batchId) => {
      const session = await getWritableSession(db, input.sessionId, actor.organizationId);
      await getActiveSessionPlayer(db, session.id, input.playerId);
      const settings = await getSettings(db, actor.organizationId);

      if (chipsReturned >= settings.highAmountWarningThreshold && !input.confirmHighAmount) {
        throw Errors.confirmationRequired("סכום גבוה מהרגיל — נדרש אישור מפורש", {
          kind: "HIGH_AMOUNT",
          threshold: settings.highAmountWarningThreshold,
        });
      }

      const before = await balancesFor(db, session.id, input.playerId);
      const historicalOpen = Math.max(0, before.historicalDebt);

      let toSessionDebt = 0;
      let toHistoricalDebt = 0;
      let cashPaid = 0;
      let nonCashPaid = 0;
      let nonCashMethod: PaymentMethod | null = null;
      let toCredit = 0;

      if (input.strategy === "DEBT_FIRST") {
        toSessionDebt = Math.min(chipsReturned, before.sessionDebt);
        let rest = chipsReturned - toSessionDebt;
        if (settings.includeHistoricalDebtInCashout) {
          toHistoricalDebt = Math.min(rest, historicalOpen);
          rest -= toHistoricalDebt;
        }
        cashPaid = rest;
      } else if (input.strategy === "PAY_FULL") {
        cashPaid = chipsReturned;
        if (before.totalDebt > 0 && settings.requireApprovalForPayWithDebt) {
          await verifyManagerApproval(db, actor.organizationId, input.approval);
        }
      } else {
        if (!input.manual) throw Errors.validation("חסרה חלוקה ידנית");
        toSessionDebt = assertAgorot(input.manual.toSessionDebt, "קיזוז חוב סשן");
        toHistoricalDebt = assertAgorot(input.manual.toHistoricalDebt, "קיזוז חוב קודם");
        cashPaid = assertAgorot(input.manual.cashPaid, "תשלום במזומן");
        nonCashPaid = assertAgorot(input.manual.nonCashPaid, "תשלום שלא במזומן");
        toCredit = assertAgorot(input.manual.toCredit, "יתרת זכות");
        if (nonCashPaid > 0) {
          nonCashMethod = requirePayableMethod(input.manual.nonCashMethod);
          if (nonCashMethod === "CASH") throw Errors.validation("תשלום שלא במזומן לא יכול להיות מזומן");
        }
        const sum = toSessionDebt + toHistoricalDebt + cashPaid + nonCashPaid + toCredit;
        if (sum !== chipsReturned) {
          throw Errors.validation("החלוקה חייבת להיות שווה בדיוק לשווי הצ׳יפים המוחזרים");
        }
        if (toSessionDebt > before.sessionDebt) throw Errors.validation("קיזוז חוב הסשן גבוה מהחוב הפתוח");
        if (toHistoricalDebt > historicalOpen) throw Errors.validation("קיזוז החוב הקודם גבוה מהחוב הפתוח");
      }

      // Physical drawer guard: paying out more cash than the drawer holds.
      if (cashPaid > 0 && !settings.allowNegativeCashDrawer) {
        const ledger = await db.ledgerTransaction.findMany({ where: { sessionId: session.id } });
        const expected = computeExpectedCash(
          ledger as unknown as LedgerTx[],
          session.id,
          session.openingCashAmount,
        );
        if (expected - cashPaid < 0) {
          throw Errors.validation("אין מספיק מזומן בקופה לתשלום — ניתן להפקיד מזומן או לבחור אמצעי אחר");
        }
      }

      const base = {
        organizationId: actor.organizationId,
        sessionId: session.id,
        playerId: input.playerId,
        createdByUserId: actor.userId,
        batchId,
        notes: input.notes || null,
      };

      await db.ledgerTransaction.create({
        data: { ...base, type: "CHIPS_RETURNED", amount: chipsReturned },
      });
      if (toSessionDebt + toHistoricalDebt > 0) {
        await db.ledgerTransaction.create({
          data: {
            ...base,
            type: "CASHOUT_APPLIED_TO_DEBT",
            amount: toSessionDebt + toHistoricalDebt,
            metadata: { allocation: { toSessionDebt, toHistoricalDebt } } as Prisma.InputJsonValue,
          },
        });
      }
      if (cashPaid > 0) {
        await db.ledgerTransaction.create({
          data: { ...base, type: "CASH_PAID_TO_PLAYER", amount: cashPaid, paymentMethod: "CASH" },
        });
      }
      if (nonCashPaid > 0) {
        await db.ledgerTransaction.create({
          data: { ...base, type: "CASH_PAID_TO_PLAYER", amount: nonCashPaid, paymentMethod: nonCashMethod },
        });
      }
      if (toCredit > 0) {
        await db.ledgerTransaction.create({
          data: {
            ...base,
            type: "PLAYER_CREDIT_CREATED",
            amount: toCredit,
            metadata: { source: "CASHOUT" } as Prisma.InputJsonValue,
          },
        });
      }

      await recomputePlayerBalance(db, input.playerId);
      const after = await balancesFor(db, session.id, input.playerId);
      const ledgerAfter = await playerLedger(db, input.playerId);
      const stats = computePlayerSessionStats(ledgerAfter, session.id, input.playerId);

      await writeAudit(db, actor, {
        action: "CASH_OUT",
        entityType: "LedgerBatch",
        entityId: batchId,
        after: {
          chipsReturned,
          toSessionDebt,
          toHistoricalDebt,
          cashPaid,
          nonCashPaid,
          toCredit,
          playerId: input.playerId,
          sessionId: session.id,
        },
      });

      const result: CashOutResult = {
        batchId,
        chipsReturned,
        toSessionDebt,
        toHistoricalDebt,
        cashPaid,
        nonCashPaid,
        creditCreated: toCredit,
        playerPosition: stats.playerPosition,
        before,
        after,
      };
      return result;
    },
    { sessionId: input.sessionId, playerId: input.playerId, actorUserId: actor.userId },
  );
}

// ---------------------------------------------------------------------------
// Cash drawer operations
// ---------------------------------------------------------------------------

export type DrawerOpKind = "DEPOSIT" | "WITHDRAWAL" | "EXPENSE";

export interface DrawerOpInput {
  idempotencyKey: string;
  sessionId: string;
  kind: DrawerOpKind;
  amount: number;
  reason: string;
  paymentMethod?: PaymentMethod; // for EXPENSE; default CASH
}

export async function recordDrawerOp(
  actor: Actor,
  input: DrawerOpInput,
): Promise<{ result: { batchId: string; expectedCashAfter: number }; duplicate: boolean }> {
  requireRole(actor, "OPERATOR");
  const amount = assertAgorot(input.amount, "הסכום");
  if (amount <= 0) throw Errors.validation("הסכום חייב להיות גדול מאפס");
  if (!input.reason?.trim()) throw Errors.validation("חובה לציין סיבה לפעולת קופה");

  return runIdempotent(
    input.idempotencyKey,
    `DRAWER_${input.kind}`,
    async (db, batchId) => {
      const session = await getWritableSession(db, input.sessionId, actor.organizationId);
      const settings = await getSettings(db, actor.organizationId);

      const type =
        input.kind === "DEPOSIT"
          ? "CASH_DRAWER_DEPOSIT"
          : input.kind === "WITHDRAWAL"
            ? "CASH_DRAWER_WITHDRAWAL"
            : "EXPENSE";
      const method: PaymentMethod = input.kind === "EXPENSE" ? (input.paymentMethod ?? "CASH") : "CASH";

      const ledger = await db.ledgerTransaction.findMany({ where: { sessionId: session.id } });
      const expectedNow = computeExpectedCash(
        ledger as unknown as LedgerTx[],
        session.id,
        session.openingCashAmount,
      );
      const cashDelta =
        type === "CASH_DRAWER_DEPOSIT" ? amount : method === "CASH" ? -amount : 0;
      const expectedAfter = expectedNow + cashDelta;
      if (expectedAfter < 0 && !settings.allowNegativeCashDrawer) {
        throw Errors.validation("הפעולה תגרום ליתרת מזומן שלילית בקופה");
      }

      await db.ledgerTransaction.create({
        data: {
          organizationId: actor.organizationId,
          sessionId: session.id,
          type,
          amount,
          paymentMethod: method,
          createdByUserId: actor.userId,
          batchId,
          notes: input.reason,
        },
      });

      await writeAudit(db, actor, {
        action: `DRAWER_${input.kind}`,
        entityType: "LedgerBatch",
        entityId: batchId,
        after: { amount, sessionId: session.id },
        reason: input.reason,
      });

      return { batchId, expectedCashAfter: expectedAfter };
    },
    { sessionId: input.sessionId, playerId: null, actorUserId: actor.userId },
  );
}

// ---------------------------------------------------------------------------
// Manual adjustment (owner/manager)
// ---------------------------------------------------------------------------

export interface AdjustmentInput {
  idempotencyKey: string;
  playerId: string;
  target: "DEBT" | "CREDIT";
  sign: 1 | -1;
  amount: number;
  reason: string;
}

export async function recordAdjustment(
  actor: Actor,
  input: AdjustmentInput,
): Promise<{ result: { batchId: string; before: BalanceSnapshot; after: BalanceSnapshot }; duplicate: boolean }> {
  requireRole(actor, "MANAGER");
  const amount = assertAgorot(input.amount, "הסכום");
  if (amount <= 0) throw Errors.validation("הסכום חייב להיות גדול מאפס");
  if (!input.reason?.trim()) throw Errors.validation("חובה לציין סיבה להתאמה ידנית");
  if (input.sign !== 1 && input.sign !== -1) throw Errors.validation("כיוון התאמה לא תקין");

  return runIdempotent(
    input.idempotencyKey,
    "ADJUSTMENT",
    async (db, batchId) => {
      const player = await db.player.findFirst({
        where: { id: input.playerId, organizationId: actor.organizationId },
      });
      if (!player) throw Errors.notFound("השחקן לא נמצא");

      const before = await balancesFor(db, null, input.playerId);
      if (input.target === "DEBT" && input.sign === -1 && amount > before.totalDebt) {
        throw Errors.validation("לא ניתן להפחית חוב מעבר לחוב הפתוח");
      }
      if (input.target === "CREDIT" && input.sign === -1 && amount > before.credit) {
        throw Errors.validation("לא ניתן להפחית יתרת זכות מעבר ליתרה הקיימת");
      }

      await db.ledgerTransaction.create({
        data: {
          organizationId: actor.organizationId,
          playerId: input.playerId,
          type: "ADJUSTMENT",
          amount,
          createdByUserId: actor.userId,
          batchId,
          notes: input.reason,
          metadata: { adjustment: { target: input.target, sign: input.sign } } as Prisma.InputJsonValue,
        },
      });

      await recomputePlayerBalance(db, input.playerId);
      const after = await balancesFor(db, null, input.playerId);

      await writeAudit(db, actor, {
        action: "ADJUSTMENT",
        entityType: "Player",
        entityId: input.playerId,
        before: { totalDebt: before.totalDebt, credit: before.credit },
        after: { totalDebt: after.totalDebt, credit: after.credit },
        reason: input.reason,
      });

      return { batchId, before, after };
    },
    { sessionId: null, playerId: input.playerId, actorUserId: actor.userId },
  );
}

// ---------------------------------------------------------------------------
// Reversal (void)
// ---------------------------------------------------------------------------

export interface ReversalInput {
  idempotencyKey: string;
  /** Reverse a whole batch (recommended) or a single transaction. */
  batchId?: string;
  transactionId?: string;
  reason: string;
  approval?: ManagerApproval; // required for operators when settings demand it
}

export interface ReversalResult {
  batchId: string;
  reversedTransactionIds: string[];
  affectedPlayerIds: string[];
}

export async function reverseTransactions(
  actor: Actor,
  input: ReversalInput,
): Promise<{ result: ReversalResult; duplicate: boolean }> {
  requireRole(actor, "OPERATOR");
  if (!input.reason?.trim()) throw Errors.validation("חובה לציין סיבה לביטול");
  if (!input.batchId && !input.transactionId) throw Errors.validation("חסר מזהה פעולה לביטול");

  return runIdempotent(
    input.idempotencyKey,
    "REVERSAL",
    async (db, reversalBatchId) => {
      const settings = await getSettings(db, actor.organizationId);
      let approvedByUserId: string | null = null;
      if (!hasAtLeastRole(actor, "MANAGER")) {
        if (settings.requireManagerApprovalForVoid) {
          approvedByUserId = await verifyManagerApproval(db, actor.organizationId, input.approval);
        }
      }

      const originals = await db.ledgerTransaction.findMany({
        where: input.batchId
          ? { batchId: input.batchId, organizationId: actor.organizationId }
          : { id: input.transactionId!, organizationId: actor.organizationId },
        orderBy: { createdAt: "asc" },
      });
      if (originals.length === 0) throw Errors.notFound("הפעולה לביטול לא נמצאה");
      if (originals.some((t) => t.type === "REVERSAL")) {
        throw Errors.validation("לא ניתן לבטל פעולת ביטול");
      }
      const active = originals.filter((t) => t.status === "ACTIVE");
      if (active.length === 0) throw Errors.validation("הפעולה כבר בוטלה");

      // Reversals only in sessions that still accept writes.
      const sessionIds = [...new Set(active.map((t) => t.sessionId).filter((s): s is string => !!s))];
      for (const sid of sessionIds) {
        await getWritableSession(db, sid, actor.organizationId);
      }

      const now = new Date();
      const reversedIds: string[] = [];
      for (const orig of active) {
        await db.ledgerTransaction.create({
          data: {
            organizationId: actor.organizationId,
            sessionId: orig.sessionId,
            playerId: orig.playerId,
            type: "REVERSAL",
            amount: orig.amount,
            paymentMethod: orig.paymentMethod,
            createdByUserId: actor.userId,
            batchId: reversalBatchId,
            referenceTransactionId: orig.id,
            notes: input.reason,
            metadata: { reversedType: orig.type, approvedByUserId } as Prisma.InputJsonValue,
          },
        });
        await db.ledgerTransaction.update({
          where: { id: orig.id },
          data: {
            status: "REVERSED",
            reversedAt: now,
            reversedByUserId: actor.userId,
            reversalReason: input.reason,
          },
        });
        reversedIds.push(orig.id);
      }

      const affectedPlayerIds = [...new Set(active.map((t) => t.playerId).filter((p): p is string => !!p))];
      for (const pid of affectedPlayerIds) {
        await recomputePlayerBalance(db, pid);
      }

      await writeAudit(db, actor, {
        action: "REVERSAL",
        entityType: "LedgerBatch",
        entityId: input.batchId ?? input.transactionId ?? null,
        before: active.map((t) => ({ id: t.id, type: t.type, amount: t.amount, status: "ACTIVE" })),
        after: active.map((t) => ({ id: t.id, type: t.type, amount: t.amount, status: "REVERSED" })),
        reason: input.reason,
      });

      return { batchId: reversalBatchId, reversedTransactionIds: reversedIds, affectedPlayerIds };
    },
    { sessionId: null, playerId: null, actorUserId: actor.userId },
  );
}
