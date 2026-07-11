"use client";

import Link from "next/link";
import { PlayCircle, Users, HandCoins, FileBarChart, Settings, ChevronLeft } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { MoneyDisplay } from "@/components/money";
import { PaymentMethodBadge, SessionStatusBadge } from "@/components/domain-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import type { PaymentMethod, SessionStatus } from "@prisma/client";

interface DashboardData {
  organizationName: string;
  activeSession: {
    id: string;
    name: string;
    status: SessionStatus;
    startedAt: string;
    activePlayers: number;
  } | null;
  totalOpenDebt: number;
  recentSessions: {
    id: string;
    name: string;
    startedAt: string;
    endedAt: string | null;
    playersCount: number;
    closingDifference: number | null;
  }[];
  topDebtors: { id: string; fullName: string; nickname: string | null; currentDebt: number }[];
  recentPayments: {
    id: string;
    amount: number;
    paymentMethod: PaymentMethod | null;
    playerName: string | null;
    createdAt: string;
  }[];
  viewer: { role: string; name: string };
}

export default function DashboardPage() {
  const { data, error, loading, refresh } = useApi<DashboardData>("/api/dashboard", { pollMs: 30000 });

  if (loading && !data) return <LoadingSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!data) return null;

  const canOperate = data.viewer.role !== "VIEWER";
  const canManage = data.viewer.role === "OWNER" || data.viewer.role === "MANAGER";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{data.organizationName}</h1>

      {/* Active session / open new */}
      {data.activeSession ? (
        <Card className="border-money-in/40 bg-money-in-bg/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <SessionStatusBadge status={data.activeSession.status} />
                <span className="text-lg font-bold">{data.activeSession.name}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                נפתח {formatTimeAgo(data.activeSession.startedAt)} · {data.activeSession.activePlayers}{" "}
                שחקנים פעילים
              </p>
            </div>
            <Button size="lg" data-testid="goto-active-session" onClick={() => (window.location.href = `/sessions/${data.activeSession!.id}`)}>
              <PlayCircle className="h-5 w-5" aria-hidden />
              כניסה לסשן
            </Button>
          </CardContent>
        </Card>
      ) : (
        canManage && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-muted">אין סשן פעיל כרגע</p>
              <Link href="/sessions/new">
                <Button size="lg" data-testid="open-new-session">
                  <PlayCircle className="h-5 w-5" aria-hidden />
                  פתיחת סשן חדש
                </Button>
              </Link>
            </CardContent>
          </Card>
        )
      )}

      {/* Summary + quick links */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted">סה״כ חוב פתוח</p>
            <p className="mt-1 text-2xl" data-testid="total-open-debt">
              <MoneyDisplay amount={data.totalOpenDebt} tone={data.totalOpenDebt > 0 ? "red" : "neutral"} />
            </p>
          </CardContent>
        </Card>
        {[
          { href: "/players", label: "שחקנים", icon: Users },
          { href: "/debts", label: "חובות", icon: HandCoins },
          { href: "/reports", label: "דוחות", icon: FileBarChart },
        ].map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="h-full transition-colors hover:bg-surface-muted">
              <CardContent className="flex h-full items-center justify-between p-4">
                <span className="flex items-center gap-2 font-medium">
                  <l.icon className="h-5 w-5 text-muted" aria-hidden />
                  {l.label}
                </span>
                <ChevronLeft className="h-4 w-4 text-muted" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent sessions */}
        <Card>
          <CardHeader>
            <CardTitle>סשנים אחרונים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentSessions.length === 0 && <EmptyState title="אין סשנים סגורים עדיין" />}
            {data.recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-surface-muted"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(s.startedAt)} · {s.playersCount} שחקנים
                  </p>
                </div>
                {s.closingDifference != null && s.closingDifference !== 0 && (
                  <MoneyDisplay amount={s.closingDifference} tone="red" withSign className="text-sm" />
                )}
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Top debtors */}
        <Card>
          <CardHeader>
            <CardTitle>חובות גבוהים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topDebtors.length === 0 && <EmptyState title="אין חובות פתוחים" />}
            {data.topDebtors.map((p) => (
              <Link
                key={p.id}
                href={`/players/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-surface-muted"
              >
                <span className="font-medium">
                  {p.fullName}
                  {p.nickname && <span className="ms-1 text-xs text-muted">({p.nickname})</span>}
                </span>
                <MoneyDisplay amount={p.currentDebt} tone="red" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardHeader>
            <CardTitle>תשלומים אחרונים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentPayments.length === 0 && <EmptyState title="אין תשלומים עדיין" />}
            {data.recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{p.playerName ?? "—"}</p>
                  <p className="text-xs text-muted">{formatTimeAgo(p.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentMethodBadge method={p.paymentMethod} />
                  <MoneyDisplay amount={p.amount} tone="green" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {canOperate && !canManage && (
        <p className="text-sm text-muted">
          <Settings className="me-1 inline h-4 w-4" aria-hidden />
          חלק מהפעולות (פתיחת סשן, סגירה, ביטולים) דורשות הרשאת מנהל.
        </p>
      )}
    </div>
  );
}
