import { describe, it, expect, beforeAll } from "vitest";
import { createWorld, PASSWORDS } from "./helpers";
import { login } from "@/server/auth";

const meta = { ipAddress: "10.0.0.1", userAgent: "vitest" };

beforeAll(async () => {
  await createWorld();
});

describe("authentication", () => {
  it("logs in with valid credentials and returns a session token", async () => {
    const res = await login("owner", PASSWORDS.owner, meta);
    expect(res.token).toHaveLength(64);
    expect(res.user.role).toBe("OWNER");
    expect(res.user.hasPin).toBe(true);
  });

  it("rejects a wrong password without leaking user existence", async () => {
    await expect(login("owner", "wrong-password", meta)).rejects.toMatchObject({
      code: "VALIDATION",
      userMessage: "שם משתמש או סיסמה שגויים",
    });
    await expect(login("no-such-user", "whatever1!", meta)).rejects.toMatchObject({
      code: "VALIDATION",
      userMessage: "שם משתמש או סיסמה שגויים",
    });
  });

  it("locks out after repeated failures", async () => {
    const badMeta = { ipAddress: "10.9.9.9", userAgent: "vitest" };
    for (let i = 0; i < 5; i++) {
      await expect(login("viewer", "bad-password", badMeta)).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
    // Sixth attempt (even with the CORRECT password) is rate limited.
    await expect(login("viewer", PASSWORDS.viewer, badMeta)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rejects inactive users", async () => {
    const { prisma } = await import("@/server/db");
    await prisma.user.updateMany({ where: { username: "operator" }, data: { isActive: false } });
    await expect(login("operator", PASSWORDS.operator, meta)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await prisma.user.updateMany({ where: { username: "operator" }, data: { isActive: true } });
  });
});
