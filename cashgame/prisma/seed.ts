/**
 * Demo data seed (development only).
 * All financial history is created through the real service layer so the
 * ledger, cached balances and audit trail stay perfectly consistent.
 *
 * DEV CREDENTIALS (documented in README.md — change in production!):
 *   owner / Owner123!  (PIN 1234)
 *   manager / Manager123!  (PIN 2345)
 *   operator / Operator123!  (PIN 3456)
 *   viewer / Viewer123!
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { Actor } from "@/server/actor";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.organization.findFirst();
  if (existing) {
    console.log("Seed skipped: organization already exists. Run `npm run db:reset` for a fresh start.");
    return;
  }

  const org = await prisma.organization.create({
    data: { name: "מועדון הקלפים", defaultCurrency: "ILS", timezone: "Asia/Jerusalem" },
  });
  await prisma.appSetting.create({ data: { organizationId: org.id } });

  const mkUser = (name: string, username: string, password: string, role: "OWNER" | "MANAGER" | "OPERATOR" | "VIEWER", pin?: string) =>
    prisma.user.create({
      data: {
        organizationId: org.id,
        name,
        username,
        passwordHash: bcrypt.hashSync(password, 12),
        role,
        pinHash: pin ? bcrypt.hashSync(pin, 12) : null,
      },
    });

  const owner = await mkUser("אורי הבעלים", "owner", "Owner123!", "OWNER", "1234");
  const manager = await mkUser("מיכל המנהלת", "manager", "Manager123!", "MANAGER", "2345");
  const operator = await mkUser("עידו המפעיל", "operator", "Operator123!", "OPERATOR", "3456");
  await mkUser("צופה לדוגמה", "viewer", "Viewer123!", "VIEWER");

  const playerNames: Array<[string, string | null, string | null]> = [
    ["אבי כהן", "אבי", "050-1234501"],
    ["יוסי לוי", null, "050-1234502"],
    ["משה פרץ", "מוש", "050-1234503"],
    ["דוד ביטון", null, "050-1234504"],
    ["שרה אזולאי", null, "050-1234505"],
    ["רועי מזרחי", "רו", "050-1234506"],
    ["איתן שלום", null, "050-1234507"],
    ["נועם אוחיון", null, "050-1234508"],
    ["ליאור חדד", null, "050-1234509"],
    ["עמית דהן", null, "050-1234510"],
  ];
  const players = [];
  for (const [fullName, nickname, phone] of playerNames) {
    players.push(
      await prisma.player.create({
        data: { organizationId: org.id, fullName, nickname, phone },
      }),
    );
  }
  // A credit limit example
  await prisma.player.update({ where: { id: players[3].id }, data: { creditLimit: 300000 } });

  const actorOf = (u: { id: string; role: Actor["role"]; name: string }): Actor => ({
    userId: u.id,
    organizationId: org.id,
    role: u.role,
    name: u.name,
  });

  // Import services lazily (they use the app's prisma singleton which shares DATABASE_URL).
  const { openSession, addPlayerToSession, exitPlayer, closeSession } = await import("@/server/services/sessions");
  const { recordBuyIn, recordCashOut, recordPayment } = await import("@/server/services/ledger");

  const managerActor = actorOf(manager);
  const operatorActor = actorOf(operator);
  const ILS = (n: number) => n * 100;
  let k = 0;
  const key = (name: string) => `seed-${name}-${k++}`;

  // ---- Closed session #1: clean night, everyone settled -------------------
  const s1 = await openSession(managerActor, { name: "ערב חמישי — שולחן ראשי", openingCashAmount: ILS(5000) });
  for (const p of players.slice(0, 4)) {
    await addPlayerToSession(operatorActor, { idempotencyKey: key("add1"), sessionId: s1.id, playerId: p.id });
  }
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s1.id, playerId: players[0].id, chipAmount: ILS(1000), paidNow: ILS(1000), paymentMethod: "CASH" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s1.id, playerId: players[1].id, chipAmount: ILS(1000), paidNow: ILS(1000), paymentMethod: "BIT" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s1.id, playerId: players[2].id, chipAmount: ILS(500), paidNow: ILS(500), paymentMethod: "CASH" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s1.id, playerId: players[3].id, chipAmount: ILS(500), paidNow: ILS(500), paymentMethod: "CASH" });
  // winners/losers
  await recordCashOut(operatorActor, { idempotencyKey: key("c"), sessionId: s1.id, playerId: players[0].id, chipsReturned: ILS(1800), strategy: "DEBT_FIRST" });
  await recordCashOut(operatorActor, { idempotencyKey: key("c"), sessionId: s1.id, playerId: players[2].id, chipsReturned: ILS(700), strategy: "DEBT_FIRST" });
  // players[1] and players[3] lost everything
  await exitPlayer(operatorActor, { sessionId: s1.id, playerId: players[0].id });
  await exitPlayer(operatorActor, { sessionId: s1.id, playerId: players[1].id, declareNoChips: true });
  await exitPlayer(operatorActor, { sessionId: s1.id, playerId: players[2].id });
  await exitPlayer(operatorActor, { sessionId: s1.id, playerId: players[3].id, declareNoChips: true });
  // expected cash: 5000 + 2000 cash in - 2500 out = 4500
  await closeSession(managerActor, {
    sessionId: s1.id,
    countedClosingCashAmount: ILS(4500),
    credential: "Manager123!",
  });

  // ---- Closed session #2: leaves open debt --------------------------------
  const s2 = await openSession(managerActor, { name: "ערב שבת — שולחן ראשי", openingCashAmount: ILS(4000) });
  for (const p of [players[4], players[5], players[6]]) {
    await addPlayerToSession(operatorActor, { idempotencyKey: key("add2"), sessionId: s2.id, playerId: p.id });
  }
  // שרה: buys 2000, pays 500 -> debt 1500; cashes out 1200 applied to debt -> debt 300
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s2.id, playerId: players[4].id, chipAmount: ILS(2000), paidNow: ILS(500), paymentMethod: "CASH" });
  await recordCashOut(operatorActor, { idempotencyKey: key("c"), sessionId: s2.id, playerId: players[4].id, chipsReturned: ILS(1200), strategy: "DEBT_FIRST" });
  // רועי: buys 1000 unpaid -> debt 1000, loses all
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s2.id, playerId: players[5].id, chipAmount: ILS(1000), paidNow: 0 });
  // איתן: buys 1500 pays full, wins 2500
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s2.id, playerId: players[6].id, chipAmount: ILS(1500), paidNow: ILS(1500), paymentMethod: "CASH" });
  await recordCashOut(operatorActor, { idempotencyKey: key("c"), sessionId: s2.id, playerId: players[6].id, chipsReturned: ILS(2500), strategy: "DEBT_FIRST" });
  await exitPlayer(operatorActor, { sessionId: s2.id, playerId: players[4].id, declareNoChips: true });
  await exitPlayer(operatorActor, { sessionId: s2.id, playerId: players[5].id, declareNoChips: true });
  await exitPlayer(operatorActor, { sessionId: s2.id, playerId: players[6].id });
  // expected: 4000 + 2000 - 2500 = 3500, counted 3480 => difference -20 with explanation
  await closeSession(managerActor, {
    sessionId: s2.id,
    countedClosingCashAmount: ILS(3480),
    differenceExplanation: "חוסר של 20 ₪ — כנראה טעות עודף",
    credential: "Manager123!",
  });

  // רועי pays part of his old debt later (standalone payment)
  await recordPayment(operatorActor, {
    idempotencyKey: key("p"),
    playerId: players[5].id,
    amount: ILS(400),
    paymentMethod: "BIT",
    strategy: "OLDEST_FIRST",
  });

  // ---- Active session with live transactions ------------------------------
  const s3 = await openSession(managerActor, { name: "ערב פוקר — היום", openingCashAmount: ILS(6000) });
  for (const p of [players[0], players[4], players[7], players[8]]) {
    await addPlayerToSession(operatorActor, { idempotencyKey: key("add3"), sessionId: s3.id, playerId: p.id });
  }
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s3.id, playerId: players[0].id, chipAmount: ILS(1000), paidNow: ILS(1000), paymentMethod: "CASH" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s3.id, playerId: players[4].id, chipAmount: ILS(500), paidNow: 0 });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s3.id, playerId: players[7].id, chipAmount: ILS(2000), paidNow: ILS(1000), paymentMethod: "BIT" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s3.id, playerId: players[8].id, chipAmount: ILS(500), paidNow: ILS(500), paymentMethod: "CASH" });
  await recordBuyIn(operatorActor, { idempotencyKey: key("b"), sessionId: s3.id, playerId: players[0].id, chipAmount: ILS(500), paidNow: ILS(500), paymentMethod: "CASH" });

  console.log("Seed complete:");
  console.log(`  org: ${org.name}`);
  console.log(`  users: owner/manager/operator/viewer (see README for passwords)`);
  console.log(`  players: ${players.length}`);
  console.log(`  sessions: 2 closed, 1 active (${s3.name})`);
  console.log(`  owner user id: ${owner.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
