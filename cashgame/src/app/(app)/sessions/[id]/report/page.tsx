"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileDown, Printer, ArrowRight } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money";
import { ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { SummaryRow } from "@/components/session/approval";
import { formatDateTime } from "@/lib/format";
import { paymentMethodLabels, sessionPlayerStatusLabels, transactionTypeLabels } from "@/lib/labels";
import type { PaymentMethod, SessionPlayerStatus, TransactionType } from "@prisma/client";

interface ReportDto {
  report: {
    session: {
      id: string;
      name: string;
      status: string;
      startedAt: string;
      endedAt: string | null;
      openedByName: string | null;
      closedByName: string | null;
      openingCashAmount: number;
    };
    totals: {
      chipsIssued: number;
      chipsReturned: number;
      paymentsInTotal: number;
      paidOutTotal: number;
      debtCreated: number;
      debtCollected: number;
      expensesTotal: number;
      paymentsIn: Record<string, number>;
      paidOut: Record<string, number>;
    };
    expectedCash: number;
    countedClosingCashAmount: number | null;
    reconciliationDifference: number | null;
    differenceExplanation: string | null;
    openSessionDebt: number;
    players: {
      playerId: string;
      fullName: string;
      nickname: string | null;
      status: SessionPlayerStatus;
      stats: {
        chipsIssued: number;
        paymentsReceived: number;
        chipsReturned: number;
        cashPaidToPlayer: number;
        playerPosition: number;
        sessionDebtOutstanding: number;
      };
    }[];
    reversals: { id: string; type: string; amount: number; reason: string | null; createdAt: string }[];
  };
  snapshots: { id: string; createdAt: string; createdByName: string; reason: string | null }[];
}

export default function SessionReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, refresh } = useApi<ReportDto>(id ? `/api/sessions/${id}/report` : null);

  if (loading && !data) return <LoadingSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!data) return null;

  const r = data.report;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/sessions/${r.session.id}`}>
          <Button variant="ghost">
            <ArrowRight className="h-5 w-5" aria-hidden />
            חזרה לסשן
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-5 w-5" aria-hidden />
            הדפסה
          </Button>
          <a href={`/api/sessions/${r.session.id}/report?format=pdf`} target="_blank" rel="noreferrer">
            <Button variant="secondary" data-testid="export-pdf">
              <FileDown className="h-5 w-5" aria-hidden />
              PDF
            </Button>
          </a>
          <a href={`/api/sessions/${r.session.id}/report?format=xlsx`}>
            <Button variant="secondary" data-testid="export-xlsx">
              <FileDown className="h-5 w-5" aria-hidden />
              Excel
            </Button>
          </a>
          <a href={`/api/sessions/${r.session.id}/report?format=csv`}>
            <Button variant="secondary">
              <FileDown className="h-5 w-5" aria-hidden />
              CSV
            </Button>
          </a>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold">דוח סשן: {r.session.name}</h1>
        <p className="text-sm text-muted">
          נפתח {formatDateTime(r.session.startedAt)} ע״י {r.session.openedByName}
          {r.session.endedAt && ` · נסגר ${formatDateTime(r.session.endedAt)} ע״י ${r.session.closedByName}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>סיכום כספי</CardTitle>
        </CardHeader>
        <CardContent data-testid="report-summary">
          <SummaryRow label="צ׳יפים שהונפקו">
            <MoneyDisplay amount={r.totals.chipsIssued} tone="blue" />
          </SummaryRow>
          <SummaryRow label="צ׳יפים שהוחזרו">
            <MoneyDisplay amount={r.totals.chipsReturned} />
          </SummaryRow>
          <SummaryRow label="תשלומים שהתקבלו">
            <MoneyDisplay amount={r.totals.paymentsInTotal} tone="green" />
          </SummaryRow>
          <SummaryRow label="שולם לשחקנים">
            <MoneyDisplay amount={r.totals.paidOutTotal} />
          </SummaryRow>
          <SummaryRow label="חוב שנוצר">
            <MoneyDisplay amount={r.totals.debtCreated} tone="red" />
          </SummaryRow>
          <SummaryRow label="חוב שנגבה">
            <MoneyDisplay amount={r.totals.debtCollected} tone="green" />
          </SummaryRow>
          <SummaryRow label="הוצאות">
            <MoneyDisplay amount={r.totals.expensesTotal} />
          </SummaryRow>
          <SummaryRow label="חוב פתוח בסוף הסשן" strong>
            <MoneyDisplay amount={r.openSessionDebt} tone={r.openSessionDebt > 0 ? "red" : "neutral"} />
          </SummaryRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>התאמת קופה</CardTitle>
        </CardHeader>
        <CardContent data-testid="report-reconciliation">
          <SummaryRow label="מזומן פתיחה">
            <MoneyDisplay amount={r.session.openingCashAmount} />
          </SummaryRow>
          <SummaryRow label="מזומן צפוי">
            <MoneyDisplay amount={r.expectedCash} />
          </SummaryRow>
          {r.countedClosingCashAmount != null && (
            <>
              <SummaryRow label="מזומן שנספר">
                <MoneyDisplay amount={r.countedClosingCashAmount} />
              </SummaryRow>
              <SummaryRow label="הפרש" strong>
                <span data-testid="report-difference">
                  <MoneyDisplay
                    amount={r.reconciliationDifference ?? 0}
                    tone={(r.reconciliationDifference ?? 0) === 0 ? "green" : "red"}
                    withSign
                  />
                </span>
              </SummaryRow>
              {r.differenceExplanation && <SummaryRow label="הסבר">{r.differenceExplanation}</SummaryRow>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>אמצעי תשלום</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="py-2 text-start">אמצעי</th>
                  <th className="py-2 text-start">התקבל</th>
                  <th className="py-2 text-start">שולם לשחקנים</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(r.totals.paymentsIn).map((m) => (
                  <tr key={m} className="border-b border-border/50">
                    <td className="py-2">{paymentMethodLabels[m as PaymentMethod]}</td>
                    <td className="py-2">
                      <MoneyDisplay amount={r.totals.paymentsIn[m]} />
                    </td>
                    <td className="py-2">
                      <MoneyDisplay amount={r.totals.paidOut[m]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>תוצאות שחקנים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="report-players">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-start">שחקן</th>
                  <th className="py-2 text-start">סטטוס</th>
                  <th className="py-2 text-start">צ׳יפים</th>
                  <th className="py-2 text-start">שולם</th>
                  <th className="py-2 text-start">הוחזר</th>
                  <th className="py-2 text-start">תוצאה</th>
                  <th className="py-2 text-start">חוב פתוח</th>
                </tr>
              </thead>
              <tbody>
                {r.players.map((p) => (
                  <tr key={p.playerId} className="border-b border-border/50">
                    <td className="py-2 font-medium">{p.fullName}</td>
                    <td className="py-2">{sessionPlayerStatusLabels[p.status]}</td>
                    <td className="py-2">
                      <MoneyDisplay amount={p.stats.chipsIssued} />
                    </td>
                    <td className="py-2">
                      <MoneyDisplay amount={p.stats.paymentsReceived} />
                    </td>
                    <td className="py-2">
                      <MoneyDisplay amount={p.stats.chipsReturned} />
                    </td>
                    <td className="py-2">
                      <MoneyDisplay amount={p.stats.playerPosition} tone="auto" withSign />
                    </td>
                    <td className="py-2">
                      <MoneyDisplay amount={p.stats.sessionDebtOutstanding} tone={p.stats.sessionDebtOutstanding > 0 ? "red" : "neutral"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {r.reversals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ביטולים ותיקונים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {r.reversals.map((rev) => (
              <div key={rev.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                <span>
                  {transactionTypeLabels[rev.type as TransactionType]} · {formatDateTime(rev.createdAt)}
                  {rev.reason && <span className="text-muted"> — {rev.reason}</span>}
                </span>
                <MoneyDisplay amount={rev.amount} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.snapshots.length > 0 && (
        <Card className="no-print">
          <CardHeader>
            <CardTitle>תיעוד סגירות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.snapshots.map((s, i) => (
              <p key={s.id}>
                סגירה {i + 1}: {formatDateTime(s.createdAt)} ע״י {s.createdByName}
                {s.reason && ` (${s.reason})`}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
