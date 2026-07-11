import { Prisma, type AppSetting, type GameSession, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma, type Tx } from "@/server/db";
import { Errors } from "@/server/errors";
import type { Actor } from "@/server/actor";
import { hasAtLeastRole } from "@/server/actor";
import { computePlayerGlobalBalance, type LedgerTx } from "@/lib/ledger-math";

/** Session statuses that accept new financial transactions. */
export function isSessionWritable(status: GameSession["status"]): boolean {
  return status === "OPEN" || status === "REOPENED" || status === "CLOSING";
}

export async function getWritableSession(db: Tx, sessionId: string, organizationId: string) {
  const session = await db.gameSession.findFirst({ where: { id: sessionId, organizationId } });
  if (!session) throw Errors.notFound("הסשן לא נמצא");
  if (!isSessionWritable(session.status)) throw Errors.sessionNotOpen();
  return session;
}

export async function getSettings(db: Tx | PrismaClient, organizationId: string): Promise<AppSetting> {
  const existing = await db.appSetting.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return db.appSetting.create({ data: { organizationId } });
}

/** Load a player's ledger rows and refresh the cached debt/credit balances. */
export async function recomputePlayerBalance(db: Tx, playerId: string): Promise<void> {
  const rows = await db.ledgerTransaction.findMany({
    where: { playerId },
    select: {
      id: true,
      sessionId: true,
      playerId: true,
      type: true,
      amount: true,
      paymentMethod: true,
      status: true,
      metadata: true,
      createdAt: true,
    },
  });
  const balance = computePlayerGlobalBalance(rows as LedgerTx[], playerId);
  await db.player.update({
    where: { id: playerId },
    data: { currentDebt: balance.totalDebt, currentCredit: balance.totalCredit },
  });
}

/** Fetch all ledger rows relevant to one player (all sessions). */
export async function getPlayerLedger(db: Tx | PrismaClient, playerId: string): Promise<LedgerTx[]> {
  const rows = await db.ledgerTransaction.findMany({
    where: { playerId },
    orderBy: { createdAt: "asc" },
  });
  return rows as unknown as LedgerTx[];
}

/** Fetch all ledger rows of one session. */
export async function getSessionLedger(db: Tx | PrismaClient, sessionId: string): Promise<LedgerTx[]> {
  const rows = await db.ledgerTransaction.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return rows as unknown as LedgerTx[];
}

export interface ManagerApproval {
  username: string;
  /** Manager PIN if set, otherwise the manager's password. */
  secret: string;
}

/**
 * Verify a manager/owner approval credential supplied inline with a request
 * (e.g. an operator voiding a transaction). Returns the approving user's id.
 */
export async function verifyManagerApproval(
  db: Tx,
  organizationId: string,
  approval: ManagerApproval | undefined,
): Promise<string> {
  if (!approval?.username || !approval.secret) {
    throw Errors.approvalRequired();
  }
  const user = await db.user.findFirst({
    where: { username: approval.username, organizationId, isActive: true },
  });
  if (!user || !hasAtLeastRole({ role: user.role }, "MANAGER")) {
    throw Errors.approvalRequired("פרטי מאשר שגויים או חסרי הרשאה");
  }
  const ok =
    (user.pinHash && (await bcrypt.compare(approval.secret, user.pinHash))) ||
    (await bcrypt.compare(approval.secret, user.passwordHash));
  if (!ok) throw Errors.approvalRequired("פרטי מאשר שגויים או חסרי הרשאה");
  return user.id;
}

/**
 * Re-authentication credential of the CURRENT actor (used at session close).
 * Accepts the actor's password or PIN.
 */
export async function verifyActorCredential(db: Tx, actor: Actor, secret: string | undefined): Promise<void> {
  if (!secret) throw Errors.approvalRequired("נדרש אימות סיסמה או קוד PIN");
  const user = await db.user.findUnique({ where: { id: actor.userId } });
  if (!user || !user.isActive) throw Errors.unauthorized();
  const ok =
    (user.pinHash && (await bcrypt.compare(secret, user.pinHash))) ||
    (await bcrypt.compare(secret, user.passwordHash));
  if (!ok) throw Errors.approvalRequired("סיסמה או קוד PIN שגויים");
}

/**
 * Run a financial command exactly once per idempotency key.
 * If the key was already processed, the stored result is returned with
 * `duplicate: true` and no new transactions are written.
 */
export async function runIdempotent<T>(
  key: string,
  command: string,
  fn: (db: Tx, batchId: string) => Promise<T>,
  meta: { sessionId?: string | null; playerId?: string | null; actorUserId: string },
): Promise<{ result: T; duplicate: boolean }> {
  if (!key || key.length < 8) throw Errors.validation("חסר מזהה ייחודי לפעולה (idempotency key)");

  const existing = await prisma.ledgerBatch.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { result: existing.resultJson as T, duplicate: true };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (db) => {
          const batch = await db.ledgerBatch.create({
            data: {
              idempotencyKey: key,
              command,
              sessionId: meta.sessionId ?? null,
              playerId: meta.playerId ?? null,
              createdByUserId: meta.actorUserId,
            },
          });
          const value = await fn(db, batch.id);
          await db.ledgerBatch.update({
            where: { id: batch.id },
            data: { resultJson: value as Prisma.InputJsonValue },
          });
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
      return { result, duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // A racing duplicate hit the unique constraint: surface the stored result.
        if (err.code === "P2002") {
          const winner = await prisma.ledgerBatch.findUnique({ where: { idempotencyKey: key } });
          if (winner) return { result: winner.resultJson as T, duplicate: true };
        }
        // Serialization conflict under concurrent load: retry the whole command.
        if (err.code === "P2034" && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }
      }
      throw err;
    }
  }
}
