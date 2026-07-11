import { describe, it, expect, beforeAll } from "vitest";
import { createWorld, createTestPlayer, idem, ILS, type TestWorld } from "./helpers";
import { openSession, addPlayerToSession, reopenSession, closeSession } from "@/server/services/sessions";
import { recordBuyIn, reverseTransactions, recordAdjustment } from "@/server/services/ledger";
import { updateSettings, createUser, listUsers } from "@/server/services/org";
import { PASSWORDS } from "./helpers";

let world: TestWorld;

beforeAll(async () => {
  world = await createWorld();
});

describe("role-based authorization (server-side)", () => {
  it("viewer cannot record financial actions", async () => {
    const player = await createTestPlayer(world.orgId, "שחקן הרשאות");
    const s = await openSession(world.manager, { name: "סשן הרשאות", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });

    await expect(
      recordBuyIn(world.viewer, {
        idempotencyKey: idem(),
        sessionId: s.id,
        playerId: player.id,
        chipAmount: ILS(100),
        paidNow: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("operator cannot open or close sessions", async () => {
    await expect(
      openSession(world.operator, { name: "אסור", openingCashAmount: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const s = await openSession(world.manager, { name: "סשן סגירה", openingCashAmount: 0 });
    await expect(
      closeSession(world.operator, {
        sessionId: s.id,
        countedClosingCashAmount: 0,
        credential: PASSWORDS.operator,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("operator void requires manager approval; approval works inline", async () => {
    const player = await createTestPlayer(world.orgId, "שחקן ביטולים");
    const s = await openSession(world.manager, { name: "סשן ביטולים", openingCashAmount: 0 });
    await addPlayerToSession(world.operator, { idempotencyKey: idem(), sessionId: s.id, playerId: player.id });
    const buyIn = await recordBuyIn(world.operator, {
      idempotencyKey: idem(),
      sessionId: s.id,
      playerId: player.id,
      chipAmount: ILS(200),
      paidNow: 0,
    });

    // Without approval → APPROVAL_REQUIRED
    await expect(
      reverseTransactions(world.operator, {
        idempotencyKey: idem(),
        batchId: buyIn.result.batchId,
        reason: "טעות הקלדה",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    // Wrong approval secret → still rejected
    await expect(
      reverseTransactions(world.operator, {
        idempotencyKey: idem(),
        batchId: buyIn.result.batchId,
        reason: "טעות הקלדה",
        approval: { username: "manager", secret: "wrong" },
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    // Manager PIN approval → allowed
    const ok = await reverseTransactions(world.operator, {
      idempotencyKey: idem(),
      batchId: buyIn.result.batchId,
      reason: "טעות הקלדה",
      approval: { username: "manager", secret: "2345" },
    });
    expect(ok.result.reversedTransactionIds.length).toBeGreaterThan(0);
  });

  it("operator cannot reopen a closed session; manager can with a reason", async () => {
    const s = await openSession(world.manager, { name: "סשן פתיחה מחדש", openingCashAmount: 0 });
    await closeSession(world.manager, {
      sessionId: s.id,
      countedClosingCashAmount: 0,
      credential: PASSWORDS.manager,
    });

    await expect(
      reopenSession(world.operator, { sessionId: s.id, reason: "רוצה לתקן" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reopenSession(world.manager, { sessionId: s.id, reason: "" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const reopened = await reopenSession(world.manager, { sessionId: s.id, reason: "תיקון" });
    expect(reopened.status).toBe("REOPENED");
  });

  it("settings and user management are owner-only", async () => {
    await expect(
      updateSettings(world.manager, { highAmountWarningThreshold: ILS(9999) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listUsers(world.manager)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createUser(world.manager, { name: "חדש", username: "newuser", password: "Password1!", role: "OPERATOR" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const updated = await updateSettings(world.owner, { highAmountWarningThreshold: ILS(9999) });
    expect(updated.highAmountWarningThreshold).toBe(ILS(9999));
  });

  it("adjustments require manager role", async () => {
    const player = await createTestPlayer(world.orgId, "שחקן התאמות");
    await expect(
      recordAdjustment(world.operator, {
        idempotencyKey: idem(),
        playerId: player.id,
        target: "DEBT",
        sign: 1,
        amount: ILS(100),
        reason: "ניסיון",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const res = await recordAdjustment(world.manager, {
      idempotencyKey: idem(),
      playerId: player.id,
      target: "DEBT",
      sign: 1,
      amount: ILS(100),
      reason: "יתרת פתיחה מהפנקס הישן",
    });
    expect(res.result.after.totalDebt).toBe(ILS(100));
  });
});
