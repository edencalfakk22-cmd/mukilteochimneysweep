import { apiHandler, ok } from "@/server/api";
import { prisma } from "@/server/db";

export const GET = apiHandler(async (_req, actor) => {
  const orgId = actor.organizationId;

  const [activeSession, recentSessions, debtors, recentPayments, org] = await Promise.all([
    prisma.gameSession.findFirst({
      where: { organizationId: orgId, status: { in: ["OPEN", "REOPENED", "CLOSING"] } },
      orderBy: { startedAt: "desc" },
      include: { _count: { select: { sessionPlayers: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.gameSession.findMany({
      where: { organizationId: orgId, status: "CLOSED" },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: {
        cashCounts: { where: { countType: "CLOSING" }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { sessionPlayers: true } },
      },
    }),
    prisma.player.findMany({
      where: { organizationId: orgId, currentDebt: { gt: 0 } },
      orderBy: { currentDebt: "desc" },
      take: 5,
      select: { id: true, fullName: true, nickname: true, currentDebt: true },
    }),
    prisma.ledgerTransaction.findMany({
      where: { organizationId: orgId, type: { in: ["PAYMENT_RECEIVED", "DEBT_PAYMENT"] }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { player: { select: { fullName: true } } },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);

  const totalDebt = await prisma.player.aggregate({
    _sum: { currentDebt: true },
    where: { organizationId: orgId, currentDebt: { gt: 0 } },
  });

  return ok({
    organizationName: org?.name ?? "",
    activeSession: activeSession
      ? {
          id: activeSession.id,
          name: activeSession.name,
          status: activeSession.status,
          startedAt: activeSession.startedAt,
          activePlayers: activeSession._count.sessionPlayers,
        }
      : null,
    totalOpenDebt: totalDebt._sum.currentDebt ?? 0,
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      name: s.name,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      playersCount: s._count.sessionPlayers,
      closingDifference: s.cashCounts[0]?.difference ?? null,
    })),
    topDebtors: debtors,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      playerName: p.player?.fullName ?? null,
      createdAt: p.createdAt,
    })),
    viewer: { role: actor.role, name: actor.name },
  });
});
