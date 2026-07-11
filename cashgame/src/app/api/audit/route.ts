import { apiHandler, ok } from "@/server/api";
import { requireRole } from "@/server/actor";
import { prisma } from "@/server/db";

export const GET = apiHandler(async (req, actor) => {
  requireRole(actor, "MANAGER");
  const params = req.nextUrl.searchParams;
  const entityType = params.get("entityType") ?? undefined;
  const action = params.get("action") ?? undefined;
  const take = Math.min(Number(params.get("take") ?? 100), 500);
  const cursor = params.get("cursor") ?? undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { user: { select: { name: true, username: true } } },
  });

  const hasMore = logs.length > take;
  return ok({
    logs: logs.slice(0, take).map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userName: l.user?.name ?? null,
      reason: l.reason,
      beforeJson: l.beforeJson,
      afterJson: l.afterJson,
      createdAt: l.createdAt,
      ipAddress: l.ipAddress,
    })),
    nextCursor: hasMore ? logs[take].id : null,
  });
});
