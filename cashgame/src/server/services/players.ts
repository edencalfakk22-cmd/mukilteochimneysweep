import { prisma } from "@/server/db";
import { Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { requireRole } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { assertAgorot } from "@/lib/money";
import { computePlayerSessionStats, effective, type LedgerTx } from "@/lib/ledger-math";

export interface PlayerUpsertInput {
  fullName: string;
  phone?: string | null;
  nickname?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  isActive?: boolean;
}

export async function createPlayer(actor: Actor, input: PlayerUpsertInput) {
  requireRole(actor, "OPERATOR");
  if (!input.fullName?.trim()) throw Errors.validation("חסר שם שחקן");
  if (input.creditLimit != null) assertAgorot(input.creditLimit, "מסגרת אשראי");

  return prisma.$transaction(async (db) => {
    const player = await db.player.create({
      data: {
        organizationId: actor.organizationId,
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        nickname: input.nickname?.trim() || null,
        notes: input.notes?.trim() || null,
        creditLimit: input.creditLimit ?? null,
      },
    });
    await writeAudit(db, actor, {
      action: "PLAYER_CREATE",
      entityType: "Player",
      entityId: player.id,
      after: { fullName: player.fullName },
    });
    return player;
  });
}

export async function updatePlayer(actor: Actor, playerId: string, input: Partial<PlayerUpsertInput>) {
  requireRole(actor, "OPERATOR");
  if (input.creditLimit != null) assertAgorot(input.creditLimit, "מסגרת אשראי");
  // Changing credit limits or deactivating players is a manager action.
  if (input.creditLimit !== undefined || input.isActive !== undefined) {
    requireRole(actor, "MANAGER");
  }

  return prisma.$transaction(async (db) => {
    const before = await db.player.findFirst({
      where: { id: playerId, organizationId: actor.organizationId },
    });
    if (!before) throw Errors.notFound("השחקן לא נמצא");

    const player = await db.player.update({
      where: { id: playerId },
      data: {
        fullName: input.fullName?.trim() || undefined,
        phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
        nickname: input.nickname === undefined ? undefined : input.nickname?.trim() || null,
        notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
        creditLimit: input.creditLimit === undefined ? undefined : input.creditLimit,
        isActive: input.isActive === undefined ? undefined : input.isActive,
      },
    });
    await writeAudit(db, actor, {
      action: "PLAYER_UPDATE",
      entityType: "Player",
      entityId: player.id,
      before: {
        fullName: before.fullName,
        phone: before.phone,
        nickname: before.nickname,
        creditLimit: before.creditLimit,
        isActive: before.isActive,
      },
      after: {
        fullName: player.fullName,
        phone: player.phone,
        nickname: player.nickname,
        creditLimit: player.creditLimit,
        isActive: player.isActive,
      },
    });
    return player;
  });
}

export async function searchPlayers(organizationId: string, query: string, opts?: { activeOnly?: boolean }) {
  const q = query.trim();
  return prisma.player.findMany({
    where: {
      organizationId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { nickname: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ fullName: "asc" }],
    take: 50,
  });
}

export async function getPlayerProfile(organizationId: string, playerId: string) {
  const player = await prisma.player.findFirst({
    where: { id: playerId, organizationId },
  });
  if (!player) throw Errors.notFound("השחקן לא נמצא");

  const txs = await prisma.ledgerTransaction.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      session: { select: { id: true, name: true } },
    },
  });

  const sessionLinks = await prisma.sessionPlayer.findMany({
    where: { playerId },
    include: { session: { select: { id: true, name: true, startedAt: true, status: true } } },
    orderBy: { joinedAt: "desc" },
  });

  const ledger = txs as unknown as LedgerTx[];
  const act = effective(ledger);
  const chipsIssuedTotal = act
    .filter((t) => t.type === "SESSION_BUY_IN" || t.type === "SESSION_REBUY")
    .reduce((a, t) => a + t.amount, 0);
  const paymentsTotal = act
    .filter((t) => t.type === "PAYMENT_RECEIVED" || t.type === "DEBT_PAYMENT")
    .reduce((a, t) => a + t.amount, 0);
  const chipsReturnedTotal = act
    .filter((t) => t.type === "CHIPS_RETURNED")
    .reduce((a, t) => a + t.amount, 0);

  const sessions = sessionLinks.map((sp) => {
    const stats = computePlayerSessionStats(ledger, sp.session.id, playerId);
    return {
      sessionId: sp.session.id,
      name: sp.session.name,
      startedAt: sp.session.startedAt,
      sessionStatus: sp.session.status,
      playerStatus: sp.status,
      stats,
    };
  });

  return {
    player,
    totals: {
      chipsIssuedTotal,
      paymentsTotal,
      chipsReturnedTotal,
      gameResultTotal: chipsReturnedTotal - chipsIssuedTotal,
      sessionsCount: sessionLinks.length,
    },
    sessions,
    transactions: txs.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      status: t.status,
      createdAt: t.createdAt,
      createdByName: t.createdBy?.name ?? null,
      sessionId: t.sessionId,
      sessionName: t.session?.name ?? null,
      notes: t.notes,
      batchId: t.batchId,
      metadata: t.metadata,
    })),
  };
}

/** Data for the dedicated debt screen. */
export async function getDebtOverview(organizationId: string) {
  const players = await prisma.player.findMany({
    where: { organizationId, OR: [{ currentDebt: { gt: 0 } }, { currentCredit: { gt: 0 } }] },
    orderBy: { currentDebt: "desc" },
  });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [debtToday, collectedToday] = await Promise.all([
    prisma.ledgerTransaction.aggregate({
      _sum: { amount: true },
      where: { organizationId, type: "DEBT_CREATED", status: "ACTIVE", createdAt: { gte: startOfDay } },
    }),
    prisma.ledgerTransaction.aggregate({
      _sum: { amount: true },
      where: {
        organizationId,
        type: { in: ["DEBT_PAYMENT", "CASHOUT_APPLIED_TO_DEBT"] },
        status: "ACTIVE",
        createdAt: { gte: startOfDay },
      },
    }),
  ]);

  const playerIds = players.map((p) => p.id);
  const lastEvents = await prisma.ledgerTransaction.findMany({
    where: {
      playerId: { in: playerIds },
      type: { in: ["DEBT_PAYMENT", "CASHOUT_APPLIED_TO_DEBT", "DEBT_CREATED"] },
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    select: { playerId: true, type: true, createdAt: true, sessionId: true },
  });

  const openSession = await prisma.gameSession.findFirst({
    where: { organizationId, status: { in: ["OPEN", "REOPENED", "CLOSING"] } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  // Session-debt split for the currently open session (if any).
  const rows = players.map((p) => {
    const lastPayment = lastEvents.find(
      (e) => e.playerId === p.id && (e.type === "DEBT_PAYMENT" || e.type === "CASHOUT_APPLIED_TO_DEBT"),
    );
    const lastDebt = lastEvents.find((e) => e.playerId === p.id && e.type === "DEBT_CREATED");
    return {
      playerId: p.id,
      fullName: p.fullName,
      nickname: p.nickname,
      phone: p.phone,
      isActive: p.isActive,
      totalDebt: p.currentDebt,
      credit: p.currentCredit,
      creditLimit: p.creditLimit,
      overLimit: p.creditLimit != null && p.currentDebt > p.creditLimit,
      lastPaymentAt: lastPayment?.createdAt ?? null,
      lastDebtAt: lastDebt?.createdAt ?? null,
    };
  });

  return {
    totalOpenDebt: players.reduce((a, p) => a + p.currentDebt, 0),
    playersWithDebt: players.filter((p) => p.currentDebt > 0).length,
    debtCreatedToday: debtToday._sum.amount ?? 0,
    debtCollectedToday: collectedToday._sum.amount ?? 0,
    overLimitCount: rows.filter((r) => r.overLimit).length,
    openSessionId: openSession?.id ?? null,
    rows,
  };
}
