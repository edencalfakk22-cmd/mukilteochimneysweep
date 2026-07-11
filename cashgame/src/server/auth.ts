/**
 * Local authentication: username + password, DB-backed sessions in an
 * httpOnly cookie, optional PIN quick-unlock, login rate limiting and
 * audit logging. All checks happen on the server.
 */

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { AppError, Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { getSettings } from "@/server/services/shared";

export const SESSION_COOKIE = "cg_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, sliding
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token + (process.env.SESSION_SECRET ?? "")).digest("hex");
}

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export function requestMeta(req?: NextRequest): RequestMeta {
  if (!req) return { ipAddress: null, userAgent: null };
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}

// ---------------------------------------------------------------------------
// Login / logout / unlock
// ---------------------------------------------------------------------------

export async function login(username: string, password: string, meta: RequestMeta) {
  const uname = username?.trim();
  if (!uname || !password) throw Errors.validation("יש להזין שם משתמש וסיסמה");

  // Rate limiting: count recent failures for this username or IP.
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: {
      createdAt: { gte: since },
      success: false,
      OR: [{ username: uname }, ...(meta.ipAddress ? [{ ipAddress: meta.ipAddress }] : [])],
    },
  });
  if (failures >= MAX_FAILED_ATTEMPTS) {
    const oldest = await prisma.loginAttempt.findFirst({
      where: { createdAt: { gte: since }, success: false, username: uname },
      orderBy: { createdAt: "asc" },
    });
    const retryAfter = oldest
      ? Math.max(30, Math.ceil((oldest.createdAt.getTime() + LOCKOUT_WINDOW_MS - Date.now()) / 1000))
      : 300;
    throw Errors.rateLimited(retryAfter);
  }

  const user = await prisma.user.findUnique({ where: { username: uname } });
  const valid = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));

  await prisma.loginAttempt.create({
    data: { username: uname, ipAddress: meta.ipAddress, success: !!valid },
  });

  if (!valid || !user) {
    // Same message for unknown user / wrong password — no user enumeration.
    throw Errors.validation("שם משתמש או סיסמה שגויים");
  }

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction(async (db) => {
    await db.authSession.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit(
      db,
      { organizationId: user.organizationId, userId: user.id, ...meta },
      { action: "LOGIN", entityType: "User", entityId: user.id },
    );
  });

  return {
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role, hasPin: !!user.pinHash },
  };
}

export async function logout(token: string | undefined, meta: RequestMeta) {
  if (!token) return;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return;
  await prisma.$transaction(async (db) => {
    await db.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await writeAudit(
      db,
      { organizationId: session.user.organizationId, userId: session.userId, ...meta },
      { action: "LOGOUT", entityType: "User", entityId: session.userId },
    );
  });
}

/** PIN quick-unlock for a locked (idle) session on an already-authenticated device. */
export async function unlockWithPin(token: string | undefined, pin: string, meta: RequestMeta) {
  const session = token ? await getLiveSession(token) : null;
  if (!session) throw Errors.unauthorized();
  const user = session.user;
  if (!user.pinHash) throw Errors.validation("לא הוגדר קוד PIN — יש להתחבר עם סיסמה");

  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: { createdAt: { gte: since }, success: false, username: `${user.username}#pin` },
  });
  if (failures >= MAX_FAILED_ATTEMPTS) throw Errors.rateLimited(300);

  const ok = await bcrypt.compare(pin, user.pinHash);
  await prisma.loginAttempt.create({
    data: { username: `${user.username}#pin`, ipAddress: meta.ipAddress, success: ok },
  });
  if (!ok) throw Errors.validation("קוד PIN שגוי");

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lockedAt: null, lastSeenAt: new Date() },
  });
  return { user: { id: user.id, name: user.name, username: user.username, role: user.role } };
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

async function getLiveSession(token: string) {
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }
  return session;
}

export interface AuthState {
  actor: Actor;
  locked: boolean;
  hasPin: boolean;
}

/** Resolve the current auth state from the request cookie. Returns null when unauthenticated. */
export async function getAuthState(): Promise<AuthState | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getLiveSession(token);
  if (!session) return null;

  const settings = await getSettings(prisma, session.user.organizationId);
  const idleMs = Date.now() - session.lastSeenAt.getTime();
  const autoLockMs = settings.sessionAutoLockMinutes * 60 * 1000;
  let locked = session.lockedAt != null;
  if (!locked && autoLockMs > 0 && idleMs > autoLockMs && session.user.pinHash) {
    await prisma.authSession.update({ where: { id: session.id }, data: { lockedAt: new Date() } });
    locked = true;
  }
  if (!locked) {
    // Sliding activity stamp (throttled to once a minute to avoid write storms).
    if (idleMs > 60_000) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      });
    }
  }

  const hdrs = await headers();
  return {
    actor: {
      userId: session.user.id,
      organizationId: session.user.organizationId,
      role: session.user.role,
      name: session.user.name,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent"),
    },
    locked,
    hasPin: !!session.user.pinHash,
  };
}

/** Require an authenticated, unlocked actor (for API route handlers). */
export async function requireActor(): Promise<Actor> {
  const state = await getAuthState();
  if (!state) throw Errors.unauthorized();
  if (state.locked) {
    throw new AppError("UNAUTHORIZED", "המסך ננעל עקב חוסר פעילות — יש להזין קוד PIN", { locked: true });
  }
  return state.actor;
}
