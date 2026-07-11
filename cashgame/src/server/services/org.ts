import { prisma } from "@/server/db";
import { Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { requireRole } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { getSettings } from "@/server/services/shared";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

/** Single-tenant deployment helper: the one organization of this install. */
export async function getOrganization() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw Errors.notFound("המערכת טרם אותחלה — הרץ db:seed");
  return org;
}

export async function getOrgSettings(organizationId: string) {
  return getSettings(prisma, organizationId);
}

export interface SettingsUpdateInput {
  organizationName?: string;
  defaultBuyInButtons?: number[];
  requireManagerApprovalForVoid?: boolean;
  requireApprovalForReopen?: boolean;
  requireApprovalForPayWithDebt?: boolean;
  allowNegativeCashDrawer?: boolean;
  defaultCashoutDebtBehavior?: "DEBT_FIRST" | "PAY_FULL" | "ASK";
  includeHistoricalDebtInCashout?: boolean;
  creditLimitBehavior?: "WARN" | "BLOCK";
  highAmountWarningThreshold?: number;
  sessionAutoLockMinutes?: number;
}

export async function updateSettings(actor: Actor, input: SettingsUpdateInput) {
  requireRole(actor, "OWNER");

  return prisma.$transaction(async (db) => {
    const before = await getSettings(db, actor.organizationId);
    if (input.organizationName?.trim()) {
      await db.organization.update({
        where: { id: actor.organizationId },
        data: { name: input.organizationName.trim() },
      });
    }
    if (input.defaultBuyInButtons) {
      if (
        !Array.isArray(input.defaultBuyInButtons) ||
        input.defaultBuyInButtons.some((v) => !Number.isSafeInteger(v) || v <= 0) ||
        input.defaultBuyInButtons.length > 8
      ) {
        throw Errors.validation("רשימת סכומי קנייה מהירה אינה תקינה");
      }
    }
    const after = await db.appSetting.update({
      where: { organizationId: actor.organizationId },
      data: {
        defaultBuyInButtons: input.defaultBuyInButtons ?? undefined,
        requireManagerApprovalForVoid: input.requireManagerApprovalForVoid ?? undefined,
        requireApprovalForReopen: input.requireApprovalForReopen ?? undefined,
        requireApprovalForPayWithDebt: input.requireApprovalForPayWithDebt ?? undefined,
        allowNegativeCashDrawer: input.allowNegativeCashDrawer ?? undefined,
        defaultCashoutDebtBehavior: input.defaultCashoutDebtBehavior ?? undefined,
        includeHistoricalDebtInCashout: input.includeHistoricalDebtInCashout ?? undefined,
        creditLimitBehavior: input.creditLimitBehavior ?? undefined,
        highAmountWarningThreshold: input.highAmountWarningThreshold ?? undefined,
        sessionAutoLockMinutes: input.sessionAutoLockMinutes ?? undefined,
      },
    });
    await writeAudit(db, actor, {
      action: "SETTINGS_UPDATE",
      entityType: "AppSetting",
      entityId: after.id,
      before,
      after,
    });
    return after;
  });
}

// ---------------------------------------------------------------------------
// User management (OWNER only)
// ---------------------------------------------------------------------------

export interface UserCreateInput {
  name: string;
  username: string;
  password: string;
  role: Role;
  pin?: string;
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function validatePassword(password: string) {
  if (!password || password.length < 8) {
    throw Errors.validation("סיסמה חייבת להכיל לפחות 8 תווים");
  }
}

function validatePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw Errors.validation("קוד PIN חייב להכיל 4–8 ספרות");
}

export async function createUser(actor: Actor, input: UserCreateInput) {
  requireRole(actor, "OWNER");
  if (!USERNAME_RE.test(input.username)) throw Errors.validation("שם משתמש אינו תקין (3–32 תווים באנגלית)");
  if (!input.name?.trim()) throw Errors.validation("חסר שם מלא");
  validatePassword(input.password);
  if (input.pin) validatePin(input.pin);

  return prisma.$transaction(async (db) => {
    const exists = await db.user.findUnique({ where: { username: input.username } });
    if (exists) throw Errors.validation("שם המשתמש כבר תפוס");
    const user = await db.user.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name.trim(),
        username: input.username,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role,
        pinHash: input.pin ? await bcrypt.hash(input.pin, 12) : null,
      },
    });
    await writeAudit(db, actor, {
      action: "USER_CREATE",
      entityType: "User",
      entityId: user.id,
      after: { username: user.username, role: user.role },
    });
    return { id: user.id, name: user.name, username: user.username, role: user.role, isActive: user.isActive };
  });
}

export interface UserUpdateInput {
  name?: string;
  role?: Role;
  isActive?: boolean;
  password?: string;
  pin?: string | null;
}

export async function updateUser(actor: Actor, userId: string, input: UserUpdateInput) {
  requireRole(actor, "OWNER");

  return prisma.$transaction(async (db) => {
    const before = await db.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
    });
    if (!before) throw Errors.notFound("המשתמש לא נמצא");
    // An owner cannot demote/deactivate the last active owner.
    if (before.role === "OWNER" && (input.role && input.role !== "OWNER" || input.isActive === false)) {
      const owners = await db.user.count({
        where: { organizationId: actor.organizationId, role: "OWNER", isActive: true },
      });
      if (owners <= 1) throw Errors.validation("לא ניתן להסיר את הבעלים האחרון");
    }
    if (input.password) validatePassword(input.password);
    if (input.pin) validatePin(input.pin);

    const user = await db.user.update({
      where: { id: userId },
      data: {
        name: input.name?.trim() || undefined,
        role: input.role ?? undefined,
        isActive: input.isActive ?? undefined,
        passwordHash: input.password ? await bcrypt.hash(input.password, 12) : undefined,
        pinHash: input.pin === undefined ? undefined : input.pin ? await bcrypt.hash(input.pin, 12) : null,
      },
    });
    if (input.isActive === false || input.password) {
      await db.authSession.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    }
    await writeAudit(db, actor, {
      action: "USER_UPDATE",
      entityType: "User",
      entityId: user.id,
      before: { role: before.role, isActive: before.isActive, name: before.name },
      after: { role: user.role, isActive: user.isActive, name: user.name },
    });
    return { id: user.id, name: user.name, username: user.username, role: user.role, isActive: user.isActive };
  });
}

export async function listUsers(actor: Actor) {
  requireRole(actor, "OWNER");
  return prisma.user.findMany({
    where: { organizationId: actor.organizationId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      pinHash: true,
    },
    orderBy: { createdAt: "asc" },
  }).then((users) =>
    users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      hasPin: !!u.pinHash,
    })),
  );
}

/** Allow any authenticated user to set their own PIN (for quick unlock). */
export async function setOwnPin(actor: Actor, currentPassword: string, pin: string | null) {
  return prisma.$transaction(async (db) => {
    const user = await db.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw Errors.unauthorized();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw Errors.forbidden("סיסמה נוכחית שגויה");
    if (pin) validatePin(pin);
    await db.user.update({
      where: { id: user.id },
      data: { pinHash: pin ? await bcrypt.hash(pin, 12) : null },
    });
    await writeAudit(db, actor, {
      action: pin ? "USER_PIN_SET" : "USER_PIN_CLEARED",
      entityType: "User",
      entityId: user.id,
    });
    return { hasPin: !!pin };
  });
}
