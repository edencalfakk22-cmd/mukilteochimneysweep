/**
 * Report document builders: turn report data into PDF / XLSX / CSV buffers.
 * PDF = RTL HTML template rendered by headless Chromium (correct Hebrew bidi).
 * All money values arrive as integer agorot and are rendered as shekels.
 */
import ExcelJS from "exceljs";
import { htmlToPdf } from "@/server/reports/pdf";
import {
  sessionReportHtml,
  playerStatementHtml,
  debtReportHtml,
  type PlayerStatementData,
  type DebtReportData,
} from "@/server/reports/html";
import { formatDateTime } from "@/lib/format";
import { transactionTypeLabels, paymentMethodLabels, sessionPlayerStatusLabels } from "@/lib/labels";
import type { SessionReportData } from "@/server/services/sessions";
import type { PaymentMethod, TransactionType } from "@prisma/client";

export type { PlayerStatementData, DebtReportData };

const ILS = (agorot: number) => agorot / 100;

// ---------------------------------------------------------------------------
// PDF (HTML → Chromium)
// ---------------------------------------------------------------------------

export async function sessionReportPdf(report: SessionReportData): Promise<Buffer> {
  return htmlToPdf(sessionReportHtml(report));
}

export async function playerStatementPdf(data: PlayerStatementData): Promise<Buffer> {
  return htmlToPdf(playerStatementHtml(data));
}

export async function debtReportPdf(data: DebtReportData): Promise<Buffer> {
  return htmlToPdf(debtReportHtml(data));
}

// ---------------------------------------------------------------------------
// Session report — XLSX / CSV
// ---------------------------------------------------------------------------

export async function sessionReportXlsx(report: SessionReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "cashgame";

  const summary = wb.addWorksheet("סיכום", { views: [{ rightToLeft: true }] });
  summary.columns = [{ width: 30 }, { width: 18 }];
  const addRow = (label: string, value: string | number, bold = false) => {
    const row = summary.addRow([label, value]);
    if (bold) row.font = { bold: true };
    return row;
  };
  addRow("דוח סשן", report.session.name, true);
  addRow("נפתח", formatDateTime(report.session.startedAt));
  if (report.session.endedAt) addRow("נסגר", formatDateTime(report.session.endedAt));
  summary.addRow([]);
  addRow("צ'יפים שהונפקו", ILS(report.totals.chipsIssued));
  addRow("צ'יפים שהוחזרו", ILS(report.totals.chipsReturned));
  addRow("תשלומים שהתקבלו", ILS(report.totals.paymentsInTotal));
  addRow("שולם לשחקנים", ILS(report.totals.paidOutTotal));
  addRow("חוב שנוצר", ILS(report.totals.debtCreated));
  addRow("חוב שנגבה", ILS(report.totals.debtCollected));
  addRow("חוב פתוח", ILS(report.openSessionDebt), true);
  summary.addRow([]);
  addRow("מזומן פתיחה", ILS(report.session.openingCashAmount));
  addRow("מזומן צפוי", ILS(report.expectedCash));
  if (report.countedClosingCashAmount != null) {
    addRow("מזומן שנספר", ILS(report.countedClosingCashAmount));
    addRow("הפרש", ILS(report.reconciliationDifference ?? 0), true);
  }

  const players = wb.addWorksheet("שחקנים", { views: [{ rightToLeft: true }] });
  players.columns = [
    { header: "שחקן", width: 24 },
    { header: "סטטוס", width: 12 },
    { header: "צ'יפים", width: 12 },
    { header: "שולם", width: 12 },
    { header: "הוחזר", width: 12 },
    { header: "שולם לשחקן", width: 14 },
    { header: "תוצאה", width: 12 },
    { header: "חוב פתוח", width: 12 },
  ] as ExcelJS.Column[];
  players.getRow(1).font = { bold: true };
  for (const p of report.players) {
    players.addRow([
      p.fullName,
      sessionPlayerStatusLabels[p.status],
      ILS(p.stats.chipsIssued),
      ILS(p.stats.paymentsReceived),
      ILS(p.stats.chipsReturned),
      ILS(p.stats.cashPaidToPlayer),
      ILS(p.stats.playerPosition),
      ILS(p.stats.sessionDebtOutstanding),
    ]);
  }

  const txs = wb.addWorksheet("פעולות", { views: [{ rightToLeft: true }] });
  txs.columns = [
    { header: "מועד", width: 18 },
    { header: "סוג", width: 20 },
    { header: "סכום", width: 12 },
    { header: "אמצעי", width: 14 },
    { header: "סטטוס", width: 10 },
    { header: "בוצע ע\"י", width: 16 },
    { header: "הערות", width: 30 },
  ] as ExcelJS.Column[];
  txs.getRow(1).font = { bold: true };
  for (const t of report.transactions) {
    txs.addRow([
      formatDateTime(t.createdAt),
      transactionTypeLabels[t.type as TransactionType],
      ILS(t.amount),
      t.paymentMethod ? paymentMethodLabels[t.paymentMethod as PaymentMethod] : "",
      t.status === "ACTIVE" ? "פעילה" : "בוטלה",
      t.createdByName ?? "",
      t.notes ?? "",
    ]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV (UTF-8 with BOM so Excel opens Hebrew correctly). */
export function sessionReportCsv(report: SessionReportData): Buffer {
  const rows: string[][] = [
    ["מועד", "סוג", "סכום (₪)", "אמצעי", "סטטוס", "בוצע ע\"י", "הערות"],
    ...report.transactions.map((t) => [
      formatDateTime(t.createdAt),
      transactionTypeLabels[t.type as TransactionType],
      String(ILS(t.amount)),
      t.paymentMethod ? paymentMethodLabels[t.paymentMethod as PaymentMethod] : "",
      t.status === "ACTIVE" ? "פעילה" : "בוטלה",
      t.createdByName ?? "",
      t.notes ?? "",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  return Buffer.from("﻿" + csv, "utf8");
}

// ---------------------------------------------------------------------------
// Player statement — XLSX
// ---------------------------------------------------------------------------

export async function playerStatementXlsx(data: PlayerStatementData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("דוח שחקן", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "מועד", width: 18 },
    { header: "סוג", width: 22 },
    { header: "סכום", width: 12 },
    { header: "אמצעי", width: 14 },
    { header: "סשן", width: 20 },
    { header: "סטטוס", width: 10 },
    { header: "הערות", width: 30 },
  ] as ExcelJS.Column[];
  ws.getRow(1).font = { bold: true };
  for (const t of data.transactions) {
    ws.addRow([
      formatDateTime(t.createdAt),
      transactionTypeLabels[t.type as TransactionType] ?? t.type,
      ILS(t.amount),
      t.paymentMethod ? (paymentMethodLabels[t.paymentMethod as PaymentMethod] ?? "") : "",
      t.sessionName ?? "",
      t.status === "ACTIVE" ? "פעילה" : "בוטלה",
      t.notes ?? "",
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Debt report — XLSX / CSV
// ---------------------------------------------------------------------------

export async function debtReportXlsx(data: DebtReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("חובות", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "שחקן", width: 24 },
    { header: "כינוי", width: 14 },
    { header: "טלפון", width: 16 },
    { header: "חוב (₪)", width: 12 },
    { header: "מסגרת (₪)", width: 12 },
    { header: "תשלום אחרון", width: 18 },
  ] as ExcelJS.Column[];
  ws.getRow(1).font = { bold: true };
  for (const r of data.rows) {
    ws.addRow([
      r.fullName,
      r.nickname ?? "",
      r.phone ?? "",
      ILS(r.totalDebt),
      r.creditLimit != null ? ILS(r.creditLimit) : "",
      r.lastPaymentAt ? formatDateTime(r.lastPaymentAt) : "",
    ]);
  }
  ws.addRow([]);
  const total = ws.addRow(["סה\"כ", "", "", ILS(data.totalOpenDebt)]);
  total.font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function debtReportCsv(data: DebtReportData): Buffer {
  const rows = [
    ["שחקן", "כינוי", "טלפון", "חוב (₪)", "מסגרת (₪)", "תשלום אחרון"],
    ...data.rows.map((r) => [
      r.fullName,
      r.nickname ?? "",
      r.phone ?? "",
      String(ILS(r.totalDebt)),
      r.creditLimit != null ? String(ILS(r.creditLimit)) : "",
      r.lastPaymentAt ? formatDateTime(r.lastPaymentAt) : "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return Buffer.from("﻿" + csv, "utf8");
}
