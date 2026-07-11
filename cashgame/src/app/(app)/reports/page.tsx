"use client";

import Link from "next/link";
import { FileBarChart, FileDown, HandCoins, Wallet } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SessionStatusBadge } from "@/components/domain-badges";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";
import type { SessionStatus } from "@prisma/client";

interface SessionRow {
  id: string;
  name: string;
  status: SessionStatus;
  startedAt: string;
  playersCount: number;
}

export default function ReportsPage() {
  const { data, error, loading, refresh } = useApi<{ sessions: SessionRow[] }>("/api/sessions");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">דוחות</h1>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-debt" aria-hidden />
              דוח חובות
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="/api/reports/debts?format=pdf" target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <FileDown className="h-4 w-4" aria-hidden />
                PDF
              </Button>
            </a>
            <a href="/api/reports/debts?format=xlsx">
              <Button variant="secondary">
                <FileDown className="h-4 w-4" aria-hidden />
                Excel
              </Button>
            </a>
            <a href="/api/reports/debts?format=csv">
              <Button variant="secondary">
                <FileDown className="h-4 w-4" aria-hidden />
                CSV
              </Button>
            </a>
            <Link href="/debts">
              <Button variant="ghost">למסך החובות</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" aria-hidden />
              דוח שחקן
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              דוח תנועות מלא לשחקן זמין מדף הפרופיל של כל שחקן (PDF / Excel).
            </p>
            <Link href="/players">
              <Button variant="ghost">לרשימת השחקנים</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5" aria-hidden />
            דוחות סשן
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !data && <LoadingSkeleton rows={3} />}
          {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
          {data && data.sessions.length === 0 && <EmptyState title="אין סשנים" />}
          {data?.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <SessionStatusBadge status={s.status} />
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-muted">{formatDateTime(s.startedAt)}</span>
              </div>
              <div className="flex gap-2">
                <Link href={`/sessions/${s.id}/report`}>
                  <Button variant="secondary" size="sm">
                    צפייה
                  </Button>
                </Link>
                <a href={`/api/sessions/${s.id}/report?format=pdf`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    PDF
                  </Button>
                </a>
                <a href={`/api/sessions/${s.id}/report?format=xlsx`}>
                  <Button variant="secondary" size="sm">
                    Excel
                  </Button>
                </a>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
