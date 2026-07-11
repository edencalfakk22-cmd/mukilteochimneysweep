/**
 * Ledger integrity verifier — `npm run verify-ledger`
 *
 * Recomputes every derived balance from the append-only ledger and checks
 * structural invariants. Prints a report and exits non-zero when problems
 * are found. Safe to run on a live database (read-only).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  computePlayerGlobalBalance,
  computeSessionTotals,
  computeExpectedCash,
  checkBuyInBatch,
  checkCashOutBatch,
  getAllocation,
  type LedgerTx,
} from "@/lib/ledger-math";

const prisma = new PrismaClient();

interface Problem {
  scope: string;
  message: string;
}

async function main() {
  const problems: Problem[] = [];
  const info: string[] = [];

  const txs = (await prisma.ledgerTransaction.findMany({
    orderBy: { createdAt: "asc" },
  })) as unknown as (LedgerTx & {
    referenceTransactionId: string | null;
    reversedAt: Date | null;
    organizationId: string;
  })[];

  info.push(`ledger transactions: ${txs.length}`);

  // -- Structural checks -----------------------------------------------------
  const byId = new Map(txs.map((t) => [t.id, t]));
  const reversalsByRef = new Map<string, number>();

  for (const t of txs) {
    if (t.amount < 0 || !Number.isSafeInteger(t.amount)) {
      problems.push({ scope: `tx ${t.id}`, message: `negative or non-integer amount: ${t.amount}` });
    }
    if (t.type === "REVERSAL") {
      if (!t.referenceTransactionId) {
        problems.push({ scope: `tx ${t.id}`, message: "REVERSAL without referenceTransactionId" });
      } else {
        const ref = byId.get(t.referenceTransactionId);
        if (!ref) {
          problems.push({ scope: `tx ${t.id}`, message: `REVERSAL references missing tx ${t.referenceTransactionId}` });
        } else {
          if (ref.status !== "REVERSED") {
            problems.push({ scope: `tx ${t.id}`, message: `REVERSAL exists but original ${ref.id} is not marked REVERSED` });
          }
          if (ref.amount !== t.amount) {
            problems.push({ scope: `tx ${t.id}`, message: `REVERSAL amount ${t.amount} != original ${ref.amount}` });
          }
          reversalsByRef.set(ref.id, (reversalsByRef.get(ref.id) ?? 0) + 1);
        }
      }
    }
    if (t.status === "REVERSED") {
      if (!t.reversedAt) {
        problems.push({ scope: `tx ${t.id}`, message: "status REVERSED but reversedAt missing" });
      }
    }
    // Allocation consistency on debt-reducing rows
    if (t.type === "CASHOUT_APPLIED_TO_DEBT" || t.type === "DEBT_PAYMENT") {
      const a = getAllocation(t);
      if (a.toSessionDebt < 0 || a.toHistoricalDebt < 0) {
        problems.push({ scope: `tx ${t.id}`, message: `negative allocation: ${JSON.stringify(a)}` });
      }
      if (a.toSessionDebt + a.toHistoricalDebt !== t.amount) {
        problems.push({
          scope: `tx ${t.id}`,
          message: `allocation sum ${a.toSessionDebt + a.toHistoricalDebt} != amount ${t.amount}`,
        });
      }
    }
  }

  for (const [refId, count] of reversalsByRef) {
    if (count > 1) {
      problems.push({ scope: `tx ${refId}`, message: `double reversal: ${count} REVERSAL rows reference it` });
    }
  }
  // REVERSED originals must have exactly one reversal marker
  for (const t of txs) {
    if (t.status === "REVERSED" && t.type !== "REVERSAL" && !reversalsByRef.has(t.id)) {
      problems.push({ scope: `tx ${t.id}`, message: "marked REVERSED but no REVERSAL row references it" });
    }
  }

  // -- Batch decomposition invariants -----------------------------------------
  const batches = await prisma.ledgerBatch.findMany({ include: { transactions: true } });
  for (const batch of batches) {
    const rows = batch.transactions as unknown as LedgerTx[];
    // Include reversed rows: the invariant held when the batch was created.
    if (batch.command === "BUY_IN") {
      const res = checkBuyInBatch(rows);
      if (!res.ok) problems.push({ scope: `batch ${batch.id}`, message: res.problems.join("; ") });
    }
    if (batch.command === "CASH_OUT") {
      const res = checkCashOutBatch(rows);
      if (!res.ok) problems.push({ scope: `batch ${batch.id}`, message: res.problems.join("; ") });
    }
  }
  info.push(`batches checked: ${batches.length}`);

  // -- Player balances ---------------------------------------------------------
  const players = await prisma.player.findMany();
  for (const p of players) {
    const own = txs.filter((t) => t.playerId === p.id);
    const computed = computePlayerGlobalBalance(own, p.id);
    if (computed.totalDebt !== p.currentDebt) {
      problems.push({
        scope: `player ${p.fullName}`,
        message: `cached debt ${p.currentDebt} != ledger-derived ${computed.totalDebt}`,
      });
    }
    if (computed.totalCredit !== p.currentCredit) {
      problems.push({
        scope: `player ${p.fullName}`,
        message: `cached credit ${p.currentCredit} != ledger-derived ${computed.totalCredit}`,
      });
    }
    if (computed.totalDebt < 0) {
      problems.push({ scope: `player ${p.fullName}`, message: `negative derived debt ${computed.totalDebt}` });
    }
    if (computed.totalCredit < 0) {
      problems.push({ scope: `player ${p.fullName}`, message: `negative derived credit ${computed.totalCredit}` });
    }
  }
  info.push(`players checked: ${players.length}`);

  // -- Sessions & cash drawer ---------------------------------------------------
  const sessions = await prisma.gameSession.findMany({
    include: { cashCounts: { orderBy: { createdAt: "asc" } } },
  });
  for (const s of sessions) {
    const rows = txs.filter((t) => t.sessionId === s.id);
    const totals = computeSessionTotals(rows, s.id);
    const expected = computeExpectedCash(rows, s.id, s.openingCashAmount);

    if (totals.chipsIssued < totals.chipsReturned) {
      // Not an error by itself (players win from each other), just informational.
    }
    if (expected < 0) {
      problems.push({ scope: `session ${s.name}`, message: `negative expected cash: ${expected}` });
    }
    const closing = s.cashCounts.filter((c) => c.countType === "CLOSING").at(-1);
    if (s.status === "CLOSED") {
      if (!closing) {
        problems.push({ scope: `session ${s.name}`, message: "CLOSED without a closing cash count" });
      } else {
        if (closing.expectedAmount !== expected) {
          problems.push({
            scope: `session ${s.name}`,
            message: `closing count expected ${closing.expectedAmount} != ledger-derived ${expected}`,
          });
        }
        if (closing.countedAmount - closing.expectedAmount !== closing.difference) {
          problems.push({ scope: `session ${s.name}`, message: "closing count difference arithmetic broken" });
        }
        if (closing.difference !== 0 && !closing.notes) {
          problems.push({
            scope: `session ${s.name}`,
            message: `closing difference ${closing.difference} without explanation`,
          });
        }
      }
    }
  }
  info.push(`sessions checked: ${sessions.length}`);

  // -- Report --------------------------------------------------------------------
  console.log("──────────────────────────────────────────");
  console.log(" Ledger integrity report");
  console.log("──────────────────────────────────────────");
  for (const line of info) console.log(" • " + line);
  if (problems.length === 0) {
    console.log("\n ✔ No integrity problems found.\n");
    process.exit(0);
  } else {
    console.log(`\n ✘ ${problems.length} problem(s) found:\n`);
    for (const p of problems) console.log(`   [${p.scope}] ${p.message}`);
    console.log();
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
