/**
 * RTL HTML report templates (printed to PDF by Chromium).
 * All values arrive as integer agorot; rendering is pure formatting.
 */
import { formatDateTime } from "@/lib/format";
import {
  transactionTypeLabels,
  paymentMethodLabels,
  sessionPlayerStatusLabels,
} from "@/lib/labels";
import type { SessionReportData } from "@/server/services/sessions";
import type { PaymentMethod, TransactionType, SessionPlayerStatus } from "@prisma/client";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "1,500 ₪" wrapped in an LTR isolate so it renders correctly inside RTL text. */
function money(agorot: number): string {
  const abs = Math.abs(agorot);
  const whole = abs % 100 === 0;
  const num = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  const sign = agorot < 0 ? "-" : "";
  return `<bdi dir="ltr">${sign}${num} ₪</bdi>`;
}

function docShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "DejaVu Sans", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
    font-size: 11px; color: #1a1a1a; direction: rtl;
  }
  h1 { font-size: 20px; margin-bottom: 2px; }
  h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .sub { color: #555; font-size: 10px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #e5e5e5; }
  th { background: #f2f2f2; font-weight: bold; }
  tr:nth-child(even) td { background: #fafafa; }
  .kv { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #eee; }
  .kv .k { color: #444; }
  .kv.strong { font-weight: bold; border-bottom: 1px solid #999; }
  .num { direction: ltr; unicode-bidi: isolate; }
  .neg { color: #b91c1c; }
  .pos { color: #15803d; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function kv(label: string, valueHtml: string, strong = false): string {
  return `<div class="kv${strong ? " strong" : ""}"><span class="k">${esc(label)}</span><span>${valueHtml}</span></div>`;
}

// ---------------------------------------------------------------------------
// Session report
// ---------------------------------------------------------------------------

export function sessionReportHtml(report: SessionReportData): string {
  const s = report.session;
  const t = report.totals;
  const methods = Object.keys(t.paymentsIn) as (keyof typeof t.paymentsIn)[];

  const body = `
  <h1>דוח סשן: ${esc(s.name)}</h1>
  <p class="sub">נפתח: ${esc(formatDateTime(s.startedAt))}${s.endedAt ? ` · נסגר: ${esc(formatDateTime(s.endedAt))}` : ""}</p>
  <p class="sub">נפתח ע"י: ${esc(s.openedByName ?? "-")}${s.closedByName ? ` · נסגר ע"י: ${esc(s.closedByName)}` : ""}</p>

  <h2>סיכום כספי</h2>
  ${kv("צ'יפים שהונפקו", money(t.chipsIssued))}
  ${kv("צ'יפים שהוחזרו", money(t.chipsReturned))}
  ${kv("תשלומים שהתקבלו", money(t.paymentsInTotal))}
  ${kv("שולם לשחקנים", money(t.paidOutTotal))}
  ${kv("חוב שנוצר", money(t.debtCreated))}
  ${kv("חוב שנגבה", money(t.debtCollected))}
  ${kv("הוצאות", money(t.expensesTotal))}
  ${kv("חוב פתוח בסוף הסשן", money(report.openSessionDebt), true)}

  <h2>התאמת קופה (מזומן)</h2>
  ${kv("מזומן פתיחה", money(s.openingCashAmount))}
  ${kv("מזומן צפוי בסגירה", money(report.expectedCash))}
  ${report.countedClosingCashAmount != null ? kv("מזומן שנספר", money(report.countedClosingCashAmount)) : ""}
  ${report.reconciliationDifference != null ? kv("הפרש", money(report.reconciliationDifference), true) : ""}
  ${report.differenceExplanation ? kv("הסבר להפרש", esc(report.differenceExplanation)) : ""}

  <h2>פירוט לפי אמצעי תשלום</h2>
  <table>
    <thead><tr><th>אמצעי</th><th>התקבל</th><th>שולם לשחקנים</th></tr></thead>
    <tbody>
      ${methods
        .map(
          (m) => `<tr>
        <td>${esc(paymentMethodLabels[m as PaymentMethod])}</td>
        <td>${money(t.paymentsIn[m])}</td>
        <td>${money(t.paidOut[m])}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <h2>שחקנים</h2>
  <table>
    <thead><tr>
      <th>שחקן</th><th>סטטוס</th><th>צ'יפים</th><th>שולם</th><th>הוחזר</th><th>שולם לשחקן</th><th>תוצאה</th><th>חוב פתוח</th>
    </tr></thead>
    <tbody>
      ${report.players
        .map(
          (p) => `<tr>
        <td>${esc(p.fullName)}${p.nickname ? ` <span class="sub">(${esc(p.nickname)})</span>` : ""}</td>
        <td>${esc(sessionPlayerStatusLabels[p.status as SessionPlayerStatus])}</td>
        <td>${money(p.stats.chipsIssued)}</td>
        <td>${money(p.stats.paymentsReceived)}</td>
        <td>${money(p.stats.chipsReturned)}</td>
        <td>${money(p.stats.cashPaidToPlayer)}</td>
        <td class="${p.stats.playerPosition >= 0 ? "pos" : "neg"}">${money(p.stats.playerPosition)}</td>
        <td class="${p.stats.sessionDebtOutstanding > 0 ? "neg" : ""}">${money(p.stats.sessionDebtOutstanding)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  ${
    report.reversals.length > 0
      ? `<h2>ביטולים ותיקונים</h2>
  <table>
    <thead><tr><th>סוג</th><th>סכום</th><th>סיבה</th><th>מועד</th></tr></thead>
    <tbody>
      ${report.reversals
        .map(
          (r) => `<tr>
        <td>${esc(transactionTypeLabels[r.type as TransactionType] ?? r.type)}</td>
        <td>${money(r.amount)}</td>
        <td>${esc(r.reason ?? "")}</td>
        <td>${esc(formatDateTime(r.createdAt))}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`
      : ""
  }

  <h2>יומן פעולות</h2>
  <table>
    <thead><tr><th>מועד</th><th>סוג</th><th>סכום</th><th>אמצעי</th><th>סטטוס</th><th>בוצע ע"י</th></tr></thead>
    <tbody>
      ${report.transactions
        .map(
          (tx) => `<tr>
        <td>${esc(formatDateTime(tx.createdAt))}</td>
        <td>${esc(transactionTypeLabels[tx.type as TransactionType] ?? tx.type)}</td>
        <td>${money(tx.amount)}</td>
        <td>${tx.paymentMethod ? esc(paymentMethodLabels[tx.paymentMethod as PaymentMethod]) : ""}</td>
        <td>${tx.status === "ACTIVE" ? "פעילה" : "בוטלה"}</td>
        <td>${esc(tx.createdByName ?? "")}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;

  return docShell(`דוח סשן — ${s.name}`, body);
}

// ---------------------------------------------------------------------------
// Player statement
// ---------------------------------------------------------------------------

export interface PlayerStatementData {
  player: { fullName: string; nickname: string | null; phone: string | null };
  currentDebt: number;
  currentCredit: number;
  transactions: {
    createdAt: Date | string;
    type: string;
    amount: number;
    paymentMethod: string | null;
    status: string;
    sessionName: string | null;
    notes: string | null;
  }[];
}

export function playerStatementHtml(data: PlayerStatementData): string {
  const body = `
  <h1>דוח שחקן: ${esc(data.player.fullName)}</h1>
  ${data.player.phone ? `<p class="sub">טלפון: <span class="num">${esc(data.player.phone)}</span></p>` : ""}
  <p class="sub">הופק: ${esc(formatDateTime(new Date()))}</p>

  <h2>יתרות</h2>
  ${kv("חוב נוכחי", money(data.currentDebt), true)}
  ${kv("יתרת זכות", money(data.currentCredit))}

  <h2>תנועות</h2>
  <table>
    <thead><tr><th>מועד</th><th>סוג</th><th>סכום</th><th>אמצעי</th><th>סשן</th><th>סטטוס</th><th>הערות</th></tr></thead>
    <tbody>
      ${data.transactions
        .map(
          (t) => `<tr>
        <td>${esc(formatDateTime(t.createdAt))}</td>
        <td>${esc(transactionTypeLabels[t.type as TransactionType] ?? t.type)}</td>
        <td>${money(t.amount)}</td>
        <td>${t.paymentMethod ? esc(paymentMethodLabels[t.paymentMethod as PaymentMethod] ?? "") : ""}</td>
        <td>${esc(t.sessionName ?? "")}</td>
        <td>${t.status === "ACTIVE" ? "פעילה" : "בוטלה"}</td>
        <td>${esc(t.notes ?? "")}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
  return docShell(`דוח שחקן — ${data.player.fullName}`, body);
}

// ---------------------------------------------------------------------------
// Debt report
// ---------------------------------------------------------------------------

export interface DebtReportData {
  totalOpenDebt: number;
  rows: {
    fullName: string;
    nickname: string | null;
    phone: string | null;
    totalDebt: number;
    creditLimit: number | null;
    lastPaymentAt: Date | string | null;
  }[];
}

export function debtReportHtml(data: DebtReportData): string {
  const body = `
  <h1>דוח חובות פתוחים</h1>
  <p class="sub">הופק: ${esc(formatDateTime(new Date()))}</p>
  ${kv('סה"כ חוב פתוח', money(data.totalOpenDebt), true)}

  <h2>פירוט</h2>
  <table>
    <thead><tr><th>שחקן</th><th>טלפון</th><th>חוב</th><th>מסגרת אשראי</th><th>תשלום אחרון</th></tr></thead>
    <tbody>
      ${data.rows
        .map(
          (r) => `<tr>
        <td>${esc(r.fullName)}${r.nickname ? ` <span class="sub">(${esc(r.nickname)})</span>` : ""}</td>
        <td class="num">${esc(r.phone ?? "")}</td>
        <td class="neg">${money(r.totalDebt)}</td>
        <td>${r.creditLimit != null ? money(r.creditLimit) : ""}</td>
        <td>${r.lastPaymentAt ? esc(formatDateTime(r.lastPaymentAt)) : "טרם שילם"}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
  return docShell("דוח חובות", body);
}
