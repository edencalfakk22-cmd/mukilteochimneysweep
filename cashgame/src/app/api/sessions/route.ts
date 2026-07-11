import { apiHandler, parseBody, ok } from "@/server/api";
import { openSessionSchema } from "@/server/schemas";
import { openSession } from "@/server/services/sessions";
import { prisma } from "@/server/db";

export const GET = apiHandler(async (req, actor) => {
  const status = req.nextUrl.searchParams.get("status");
  const sessions = await prisma.gameSession.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(status === "open" ? { status: { in: ["OPEN", "REOPENED", "CLOSING"] } } : {}),
      ...(status === "closed" ? { status: "CLOSED" } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      openedBy: { select: { name: true } },
      _count: { select: { sessionPlayers: true } },
      cashCounts: { where: { countType: "CLOSING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return ok({
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      openedByName: s.openedBy.name,
      playersCount: s._count.sessionPlayers,
      openingCashAmount: s.openingCashAmount,
      closingDifference: s.cashCounts[0]?.difference ?? null,
    })),
  });
});

export const POST = apiHandler(async (req, actor) => {
  const body = await parseBody(req, openSessionSchema);
  const session = await openSession(actor, body);
  return ok({ session }, { status: 201 });
});
