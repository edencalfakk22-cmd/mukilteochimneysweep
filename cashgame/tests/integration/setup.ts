/**
 * Integration test setup: runs against the dedicated cashgame_test database.
 * Applies migrations once, truncates all data before each test file.
 */
import { execSync } from "node:child_process";
import { beforeAll, afterAll } from "vitest";
import * as dotenv from "dotenv";

dotenv.config();

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "").replace(/\/[a-zA-Z0-9_-]+(\?|$)/, "/cashgame_test$1");

if (!TEST_DB_URL.includes("cashgame_test")) {
  throw new Error("Refusing to run integration tests against a non-test database");
}
process.env.DATABASE_URL = TEST_DB_URL;

let migrated = false;

beforeAll(async () => {
  if (!migrated) {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: "pipe",
    });
    migrated = true;
  }
  const { prisma } = await import("@/server/db");
  // Truncate everything (order-independent via CASCADE).
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "CashDrawerCount", "ClosingSnapshot", "LedgerTransaction",
      "LedgerBatch", "SessionPlayer", "GameSession", "Player", "LoginAttempt",
      "AuthSession", "User", "AppSetting", "Organization" CASCADE
  `);
});

afterAll(async () => {
  const { prisma } = await import("@/server/db");
  await prisma.$disconnect();
});
