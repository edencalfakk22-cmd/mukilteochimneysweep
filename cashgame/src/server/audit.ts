import type { Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";

export interface AuditContext {
  organizationId: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Write an audit log row (inside the caller's DB transaction when relevant). */
export async function writeAudit(
  db: Tx,
  ctx: AuditContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeJson: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterJson: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: entry.reason ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
}
