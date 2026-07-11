import type { Role } from "@prisma/client";
import { Errors } from "@/server/errors";

/** The authenticated user performing an action, as resolved by the auth layer. */
export interface Actor {
  userId: string;
  organizationId: string;
  role: Role;
  name: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const roleRank: Record<Role, number> = {
  VIEWER: 0,
  OPERATOR: 1,
  MANAGER: 2,
  OWNER: 3,
};

export function hasAtLeastRole(actor: Pick<Actor, "role">, role: Role): boolean {
  return roleRank[actor.role] >= roleRank[role];
}

/** Throw FORBIDDEN unless the actor has at least the given role. */
export function requireRole(actor: Pick<Actor, "role">, role: Role): void {
  if (!hasAtLeastRole(actor, role)) throw Errors.forbidden();
}

/** Roles allowed to record ordinary financial actions in a live session. */
export function requireOperator(actor: Pick<Actor, "role">): void {
  requireRole(actor, "OPERATOR");
}
