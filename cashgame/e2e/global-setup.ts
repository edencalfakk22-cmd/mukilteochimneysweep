import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Prepare the dedicated E2E database before the run:
 * apply migrations (additive), truncate all tables, seed demo data.
 */
export default async function globalSetup() {
  const E2E_DB_URL =
    process.env.E2E_DATABASE_URL ?? "postgresql://postgres:cashgame_dev_pw@localhost:5432/cashgame_e2e";
  if (!E2E_DB_URL.includes("e2e")) {
    throw new Error("Refusing to reset a non-e2e database");
  }
  const env = { ...process.env, DATABASE_URL: E2E_DB_URL };

  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });

  const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } });
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "AuditLog", "CashDrawerCount", "ClosingSnapshot", "LedgerTransaction",
        "LedgerBatch", "SessionPlayer", "GameSession", "Player", "LoginAttempt",
        "AuthSession", "User", "AppSetting", "Organization" CASCADE
    `);
  } finally {
    await prisma.$disconnect();
  }

  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
