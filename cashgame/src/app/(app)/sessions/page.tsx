"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { MoneyDisplay } from "@/components/money";
import { SessionStatusBadge } from "@/components/domain-badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";
import type { SessionStatus } from "@prisma/client";

interface SessionRow {
  id: string;
  name: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  openedByName: string;
  playersCount: number;
  openingCashAmount: number;
  closingDifference: number | null;
}

export default function SessionsPage() {
  const { data, error, loading, refresh } = useApi<{ sessions: SessionRow[] }>("/api/sessions");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">סשנים</h1>
        <Link href="/sessions/new">
          <Button data-testid="new-session-button">
            <Plus className="h-5 w-5" aria-hidden />
            סשן חדש
          </Button>
        </Link>
      </div>

      {loading && !data && <LoadingSkeleton rows={4} />}
      {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
      {data && data.sessions.length === 0 && (
        <EmptyState title="אין סשנים עדיין" description="פתח סשן חדש כדי להתחיל" />
      )}

      <div className="space-y-2">
        {data?.sessions.map((s) => (
          <Link key={s.id} href={`/sessions/${s.id}`} className="block">
            <Card className="transition-colors hover:bg-surface-muted">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <SessionStatusBadge status={s.status} />
                    <span className="text-lg font-semibold">{s.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(s.startedAt)} · נפתח ע״י {s.openedByName} · {s.playersCount} שחקנים
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    קופה: <MoneyDisplay amount={s.openingCashAmount} />
                  </span>
                  {s.closingDifference != null && s.closingDifference !== 0 && (
                    <span className="text-debt">
                      הפרש: <MoneyDisplay amount={s.closingDifference} tone="red" withSign />
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
