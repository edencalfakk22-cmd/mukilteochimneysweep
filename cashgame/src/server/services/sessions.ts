import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { requireRole } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { assertAgorot } from "@/lib/money";
import {
  computePlayerSessionStats,
  computeSessionTotals,
  computeExpectedCash,
  splitPlayerDebt,
  type LedgerTx,
} from "@/lib/ledger-math";
import {
  getWritableSession,
  getSettings,
  getSessionLedger,
  verifyActorCredential,
  verifyManagerApproval,
  type ManagerApproval,
} from "@/server/services/shared";
import { recordBuyIn, type BuyInResult } from "@/server/services/ledger";

// ---------------------------------------------------------------------------
// Open session
// ---------------------------------------------------------------------------

export interface OpenSessionInput {
  name: string;
  openingCashAmount: number;
  denominations?: Record<string, number>;
  notes?: string;
}

export async function openSession(actor: Actor, input: OpenSessionInput) {
  requireRole(actor, "MANAGER");
  const opening = assertAgorot(input.openingCashAmount, "מזומן פתיחה");
  if (!input.name?.trim()) throw Errors.validation("חובה לתת שם לסשן");

  return prisma.$transaction(async (db) => {
    const session = await db.gameSession.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name.trim(),
        status: "OPEN",
        openedByUserId: actor.userId,
        openingCashAmount: opening,
        notes: input.notes || null,
      },
    });
    await db.cashDrawerCount.create({
      data: {
        sessionId: session.id,
        countType: "OPENING",
        countedAmount: opening,
        expectedAmount: opening,
        difference: 0,
        countedByUserId: actor.userId,
        denominations: (input.denominations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await writeAudit(db, actor, {
      action: "SESSION_OPEN",
      entityType: "GameSession",
      entityId: session.id,
      after: { name: session.name, openingCashAmount: opening },
    });
    return session;
  });
}

// ---------------------------------------------------------------------------
// Add player to session
// ---------------------------------------------------------------------------

export interface AddPlayerInput {
  idempotencyKey: string;
  sessionId: string;
  playerId?: string;
  newPlayer?: { fullName: string; phone?: string; nickname?: string; notes?: string };
  seatNumber?: number;
  initialBuyIn?: {
    chipAmount: number;
    paidNow: number;
    paymentMethod?: "CASH" | "BIT" | "BANK_TRANSFER" | "CREDIT_CARD" | "OTHER";
    confirmHighAmount?: boolean;
    confirmOverLimit?: boolean;
  };
}

export async function addPlayerToSession(actor: Actor, input: AddPlayerInput) {
  requireRole(actor, "OPERATOR");

  // Resolve or create the player first (its own transaction).
  const playerId = await prisma.$transaction(async (db) => {
    await getWritableSession(db, input.sessionId, actor.organizationId);

    let pid = input.playerId;
    if (!pid) {
      if (!input.newPlayer?.fullName?.trim()) throw Errors.validation("חסר שם שחקן");
      const created = await db.player.create({
        data: {
          organizationId: actor.organizationId,
          fullName: input.newPlayer.fullName.trim(),
          phone: input.newPlayer.phone?.trim() || null,
          nickname: input.newPlayer.nickname?.trim() || null,
          notes: input.newPlayer.notes?.trim() || null,
        },
      });
      await writeAudit(db, actor, {
        action: "PLAYER_CREATE",
        entityType: "Player",
        entityId: created.id,
        after: { fullName: created.fullName },
      });
      pid = created.id;
    } else {
      const exists = await db.player.findFirst({
        where: { id: pid, organizationId: actor.organizationId },
      });
      if (!exists) throw Errors.notFound("השחקן לא נמצא");
    }

    const existing = await db.sessionPlayer.findUnique({
      where: { sessionId_playerId: { sessionId: input.sessionId, playerId: pid } },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw Errors.conflict("השחקן כבר נמצא בסשן — ניתן לבצע קנייה חוזרת מכרטיס השחקן");
      }
      await db.sessionPlayer.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", leftAt: null },
      });
    } else {
      await db.sessionPlayer.create({
        data: {
          sessionId: input.sessionId,
          playerId: pid,
          seatNumber: input.seatNumber ?? null,
        },
      });
    }
    await writeAudit(db, actor, {
      action: "SESSION_PLAYER_ADD",
      entityType: "SessionPlayer",
      entityId: pid,
      after: { sessionId: input.sessionId, playerId: pid },
    });
    return pid;
  });

  // Optional initial buy-in as a proper idempotent ledger command.
  let buyIn: BuyInResult | null = null;
  if (input.initialBuyIn && input.initialBuyIn.chipAmount > 0) {
    const res = await recordBuyIn(actor, {
      idempotencyKey: `${input.idempotencyKey}:initial-buyin`,
      sessionId: input.sessionId,
      playerId,
      chipAmount: input.initialBuyIn.chipAmount,
      paidNow: input.initialBuyIn.paidNow,
      paymentMethod: input.initialBuyIn.paymentMethod ?? null,
      confirmHighAmount: input.initialBuyIn.confirmHighAmount,
      confirmOverLimit: input.initialBuyIn.confirmOverLimit,
    });
    buyIn = res.result;
  }

  return { playerId, buyIn };
}

// ---------------------------------------------------------------------------
// Player exit
// ---------------------------------------------------------------------------

export interface ExitPlayerInput {
  sessionId: string;
  playerId: string;
  /** Player has no chips to return (lost them all). */
  declareNoChips?: boolean;
  note?: string;
}

export async function exitPlayer(actor: Actor, input: ExitPlayerInput) {
  requireRole(actor, "OPERATOR");

  return prisma.$transaction(async (db) => {
    const session = await getWritableSession(db, input.sessionId, actor.organizationId);
    const sp = await db.sessionPlayer.findUnique({
      where: { sessionId_playerId: { sessionId: session.id, playerId: input.playerId } },
      include: { player: true },
    });
    if (!sp) throw Errors.notFound("השחקן אינו משויך לסשן");
    if (sp.status !== "ACTIVE") throw Errors.validation("השחקן כבר יצא מהסשן");

    const ledger = await getSessionLedger(db, session.id);
    const stats = computePlayerSessionStats(ledger as LedgerTx[], session.id, input.playerId);

    if (stats.unsettledChips > 0 && !input.declareNoChips) {
      throw Errors.confirmationRequired(
        "לשחקן יש צ׳יפים שטרם הוחזרו — יש לבצע פדיון או להצהיר שאין צ׳יפים להחזרה",
        { kind: "UNSETTLED_CHIPS", unsettledChips: stats.unsettledChips },
      );
    }

    const updated = await db.sessionPlayer.update({
      where: { id: sp.id },
      data: {
        status: "LEFT",
        leftAt: new Date(),
        notes: [sp.notes, input.note, input.declareNoChips && stats.unsettledChips > 0 ? "הוצהר: אין צ׳יפים להחזרה" : null]
          .filter(Boolean)
          .join(" | ") || null,
      },
    });

    await writeAudit(db, actor, {
      action: "SESSION_PLAYER_EXIT",
      entityType: "SessionPlayer",
      entityId: sp.id,
      after: {
        playerId: input.playerId,
        sessionId: session.id,
        declaredNoChips: !!input.declareNoChips,
        unsettledChips: stats.unsettledChips,
        playerPosition: stats.playerPosition,
        sessionDebtOutstanding: stats.sessionDebtOutstanding,
      },
      reason: input.note || null,
    });

    return { sessionPlayer: updated, stats };
  });
}

// ---------------------------------------------------------------------------
// Interim cash count
// ---------------------------------------------------------------------------

export interface InterimCountInput {
  sessionId: string;
  countedAmount: number;
  denominations?: Record<string, number>;
  notes?: string;
}

export async function recordInterimCount(actor: Actor, input: InterimCountInput) {
  requireRole(actor, "OPERATOR");
  const counted = assertAgorot(input.countedAmount, "הסכום שנספר");

  return prisma.$transaction(async (db) => {
    const session = await getWritableSession(db, input.sessionId, actor.organizationId);
    const ledger = await getSessionLedger(db, session.id);
    const expected = computeExpectedCash(ledger as LedgerTx[], session.id, session.openingCashAmount);
    const count = await db.cashDrawerCount.create({
      data: {
        sessionId: session.id,
        countType: "INTERIM",
        countedAmount: counted,
        expectedAmount: expected,
        difference: counted - expected,
        countedByUserId: actor.userId,
        denominations: (input.denominations ?? undefined) as Prisma.InputJsonValue | undefined,
        notes: input.notes || null,
      },
    });
    await writeAudit(db, actor, {
      action: "DRAWER_INTERIM_COUNT",
      entityType: "CashDrawerCount",
      entityId: count.id,
      after: { counted, expected, difference: counted - expected },
    });
    return count;
  });
}

// ---------------------------------------------------------------------------
// Close / reopen
// ---------------------------------------------------------------------------

export interface CloseSessionInput {
  sessionId: string;
  countedClosingCashAmount: number;
  denominations?: Record<string, number>;
  differenceExplanation?: string;
  /** Current user re-authentication (password or PIN). */
  credential: string;
  /** Manager approval when a non-zero difference is being accepted. */
  approval?: ManagerApproval;
  notes?: string;
  expectedVersion?: number;
}

export async function closeSession(actor: Actor, input: CloseSessionInput) {
  requireRole(actor, "MANAGER");
  const counted = assertAgorot(input.countedClosingCashAmount, "מזומן שנספר");

  return prisma.$transaction(
    async (db) => {
      const session = await db.gameSession.findFirst({
        where: { id: input.sessionId, organizationId: actor.organizationId },
      });
      if (!session) throw Errors.notFound("הסשן לא נמצא");
      if (session.status === "CLOSED") throw Errors.conflict("הסשן כבר סגור");
      if (input.expectedVersion != null && session.version !== input.expectedVersion) {
        throw Errors.conflict();
      }

      await verifyActorCredential(db, actor, input.credential);

      // All players must have exited (or been settled) before closing.
      const activePlayers = await db.sessionPlayer.findMany({
        where: { sessionId: session.id, status: "ACTIVE" },
        include: { player: true },
      });
      if (activePlayers.length > 0) {
        throw Errors.confirmationRequired("יש שחקנים פעילים שטרם יצאו מהסשן", {
          kind: "ACTIVE_PLAYERS",
          players: activePlayers.map((sp) => ({ id: sp.playerId, name: sp.player.fullName })),
        });
      }

      const ledger = await getSessionLedger(db, session.id);
      const expected = computeExpectedCash(ledger as LedgerTx[], session.id, session.openingCashAmount);
      const difference = counted - expected;

      if (difference !== 0) {
        if (!input.differenceExplanation?.trim()) {
          throw Errors.confirmationRequired("קיים הפרש בקופה — חובה לציין הסבר", {
            kind: "CASH_DIFFERENCE",
            expected,
            counted,
            difference,
          });
        }
        // A non-zero difference needs a manager sign-off. The closer is already
        // MANAGER+, but an explicit second credential is required by settings.
        const settings = await getSettings(db, actor.organizationId);
        if (settings.requireManagerApprovalForVoid && input.approval) {
          await verifyManagerApproval(db, actor.organizationId, input.approval);
        }
      }

      await db.cashDrawerCount.create({
        data: {
          sessionId: session.id,
          countType: "CLOSING",
          countedAmount: counted,
          expectedAmount: expected,
          difference,
          countedByUserId: actor.userId,
          denominations: (input.denominations ?? undefined) as Prisma.InputJsonValue | undefined,
          notes: input.differenceExplanation || null,
        },
      });

      // Immutable closing snapshot (full report data).
      const report = await buildSessionReportData(db, actor.organizationId, session.id, {
        countedClosingCashAmount: counted,
        differenceExplanation: input.differenceExplanation || null,
        closedByName: actor.name,
      });

      const snapshot = await db.closingSnapshot.create({
        data: {
          sessionId: session.id,
          createdByUserId: actor.userId,
          snapshot: report as unknown as Prisma.InputJsonValue,
          reason: session.status === "REOPENED" ? "סגירה מחדש" : null,
        },
      });

      const closed = await db.gameSession.update({
        where: { id: session.id },
        data: {
          status: "CLOSED",
          endedAt: new Date(),
          closedByUserId: actor.userId,
          countedClosingCashAmount: counted,
          notes: input.notes ?? session.notes,
          version: { increment: 1 },
        },
      });

      // Everyone who left is now settled.
      await db.sessionPlayer.updateMany({
        where: { sessionId: session.id, status: "LEFT" },
        data: { status: "SETTLED" },
      });

      await writeAudit(db, actor, {
        action: "SESSION_CLOSE",
        entityType: "GameSession",
        entityId: session.id,
        before: { status: session.status },
        after: { status: "CLOSED", counted, expected, difference, snapshotId: snapshot.id },
        reason: input.differenceExplanation || null,
      });

      return { session: closed, expected, counted, difference, snapshotId: snapshot.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
  );
}

export interface ReopenSessionInput {
  sessionId: string;
  reason: string;
}

export async function reopenSession(actor: Actor, input: ReopenSessionInput) {
  requireRole(actor, "MANAGER");
  if (!input.reason?.trim()) throw Errors.validation("חובה לציין סיבה לפתיחה מחדש");

  return prisma.$transaction(async (db) => {
    const session = await db.gameSession.findFirst({
      where: { id: input.sessionId, organizationId: actor.organizationId },
    });
    if (!session) throw Errors.notFound("הסשן לא נמצא");
    if (session.status !== "CLOSED") throw Errors.validation("רק סשן סגור ניתן לפתוח מחדש");

    const settings = await getSettings(db, actor.organizationId);
    if (settings.requireApprovalForReopen && actor.role !== "OWNER") {
      // Managers may reopen, but the action is always audited with the reason.
    }

    const reopened = await db.gameSession.update({
      where: { id: session.id },
      data: { status: "REOPENED", endedAt: null, version: { increment: 1 } },
    });

    await writeAudit(db, actor, {
      action: "SESSION_REOPEN",
      entityType: "GameSession",
      entityId: session.id,
      before: { status: "CLOSED" },
      after: { status: "REOPENED" },
      reason: input.reason,
    });

    return reopened;
  });
}

// ---------------------------------------------------------------------------
// Live session state (the data behind the live dashboard)
// ---------------------------------------------------------------------------

export async function getSessionState(organizationId: string, sessionId: string) {
  const session = await prisma.gameSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      sessionPlayers: { include: { player: true }, orderBy: { joinedAt: "asc" } },
      cashCounts: { orderBy: { createdAt: "asc" }, include: { countedBy: { select: { name: true } } } },
    },
  });
  if (!session) throw Errors.notFound("הסשן לא נמצא");

  const ledger = (await prisma.ledgerTransaction.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  })) as unknown as (LedgerTx & { createdBy: { name: string }; batchId: string | null; notes: string | null })[];

  const totals = computeSessionTotals(ledger, sessionId);
  const expectedCash = computeExpectedCash(ledger, sessionId, session.openingCashAmount);

  // Per-player stats need each player's FULL ledger for historical debt split.
  const playerIds = session.sessionPlayers.map((sp) => sp.playerId);
  const allPlayerTxs = (await prisma.ledgerTransaction.findMany({
    where: { playerId: { in: playerIds } },
    orderBy: { createdAt: "asc" },
  })) as unknown as LedgerTx[];

  const players = session.sessionPlayers.map((sp) => {
    const own = allPlayerTxs.filter((t) => t.playerId === sp.playerId);
    const stats = computePlayerSessionStats(own, sessionId, sp.playerId);
    const debtSplit = splitPlayerDebt(own, sessionId, sp.playerId);
    return {
      sessionPlayerId: sp.id,
      playerId: sp.playerId,
      fullName: sp.player.fullName,
      nickname: sp.player.nickname,
      phone: sp.player.phone,
      status: sp.status,
      seatNumber: sp.seatNumber,
      joinedAt: sp.joinedAt,
      leftAt: sp.leftAt,
      creditLimit: sp.player.creditLimit,
      credit: sp.player.currentCredit,
      stats,
      debt: debtSplit,
    };
  });

  const openSessionDebt = players.reduce((acc, p) => acc + p.stats.sessionDebtOutstanding, 0);

  return {
    session: {
      id: session.id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      openingCashAmount: session.openingCashAmount,
      countedClosingCashAmount: session.countedClosingCashAmount,
      notes: session.notes,
      version: session.version,
      openedBy: session.openedBy,
      closedBy: session.closedBy,
    },
    players,
    totals,
    expectedCash,
    openSessionDebt,
    activePlayers: players.filter((p) => p.status === "ACTIVE").length,
    cashCounts: session.cashCounts,
    ledger: ledger
      .slice()
      .reverse()
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        paymentMethod: t.paymentMethod,
        playerId: t.playerId,
        status: t.status,
        createdAt: t.createdAt,
        createdByName: t.createdBy?.name,
        batchId: t.batchId,
        notes: t.notes,
      })),
  };
}

export type SessionState = Awaited<ReturnType<typeof getSessionState>>;

// ---------------------------------------------------------------------------
// Session report data (also used for the closing snapshot)
// ---------------------------------------------------------------------------

export async function buildSessionReportData(
  db: Tx,
  organizationId: string,
  sessionId: string,
  closing?: {
    countedClosingCashAmount: number | null;
    differenceExplanation: string | null;
    closedByName: string | null;
  },
) {
  const session = await db.gameSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      sessionPlayers: { include: { player: true } },
      cashCounts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) throw Errors.notFound("הסשן לא נמצא");

  const ledger = (await db.ledgerTransaction.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  })) as unknown as (LedgerTx & { createdBy: { name: string } | null; notes: string | null; reversalReason: string | null })[];

  const totals = computeSessionTotals(ledger, sessionId);
  const expectedCash = computeExpectedCash(ledger, sessionId, session.openingCashAmount);

  const playerIds = session.sessionPlayers.map((sp) => sp.playerId);
  const allPlayerTxs = (await db.ledgerTransaction.findMany({
    where: { playerId: { in: playerIds } },
    orderBy: { createdAt: "asc" },
  })) as unknown as LedgerTx[];

  const players = session.sessionPlayers.map((sp) => {
    const own = allPlayerTxs.filter((t) => t.playerId === sp.playerId);
    const stats = computePlayerSessionStats(own, sessionId, sp.playerId);
    return {
      playerId: sp.playerId,
      fullName: sp.player.fullName,
      nickname: sp.player.nickname,
      status: sp.status,
      stats,
    };
  });

  const counted = closing?.countedClosingCashAmount ?? session.countedClosingCashAmount;
  const closingCount = session.cashCounts.filter((c) => c.countType === "CLOSING").at(-1);
  const differenceExplanation = closing?.differenceExplanation ?? closingCount?.notes ?? null;
  const reversals = ledger.filter((t) => t.type === "REVERSAL" || t.status === "REVERSED");

  return {
    generatedAt: new Date().toISOString(),
    session: {
      id: session.id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      openedByName: session.openedBy?.name ?? null,
      closedByName: closing?.closedByName ?? session.closedBy?.name ?? null,
      openingCashAmount: session.openingCashAmount,
      notes: session.notes,
    },
    totals,
    expectedCash,
    countedClosingCashAmount: counted ?? null,
    reconciliationDifference: counted != null ? counted - expectedCash : null,
    differenceExplanation,
    players,
    openSessionDebt: players.reduce((a, p) => a + p.stats.sessionDebtOutstanding, 0),
    cashCounts: session.cashCounts.map((c) => ({
      countType: c.countType,
      countedAmount: c.countedAmount,
      expectedAmount: c.expectedAmount,
      difference: c.difference,
      createdAt: c.createdAt,
      notes: c.notes,
    })),
    reversals: reversals.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      reason: t.reversalReason ?? t.notes ?? null,
      createdAt: t.createdAt,
    })),
    transactions: ledger.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      playerId: t.playerId,
      status: t.status,
      createdAt: t.createdAt,
      createdByName: t.createdBy?.name ?? null,
      notes: t.notes ?? null,
    })),
  };
}

export type SessionReportData = Awaited<ReturnType<typeof buildSessionReportData>>;
