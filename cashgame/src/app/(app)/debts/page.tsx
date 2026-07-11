"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircle, FileDown } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/money";
import { DebtBadge } from "@/components/domain-badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";

interface DebtRow {
  playerId: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  isActive: boolean;
  totalDebt: number;
  credit: number;
  creditLimit: number | null;
  overLimit: boolean;
  lastPaymentAt: string | null;
  lastDebtAt: string | null;
}

interface DebtOverview {
  totalOpenDebt: number;
  playersWithDebt: number;
  debtCreatedToday: number;
  debtCollectedToday: number;
  overLimitCount: number;
  openSessionId: string | null;
  rows: DebtRow[];
}

type SortKey = "debt" | "oldest" | "recent" | "overlimit";

export default function DebtsPage() {
  const { data, error, loading, refresh } = useApi<DebtOverview>("/api/debts");
  const [sort, setSort] = React.useState<SortKey>("debt");
  const [activeOnly, setActiveOnly] = React.useState(false);

  if (loading && !data) return <LoadingSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!data) return null;

  const rows = data.rows
    .filter((r) => r.totalDebt > 0)
    .filter((r) => !activeOnly || r.isActive)
    .sort((a, b) => {
      switch (sort) {
        case "oldest": {
          const ta = a.lastPaymentAt ? new Date(a.lastPaymentAt).getTime() : 0;
          const tb = b.lastPaymentAt ? new Date(b.lastPaymentAt).getTime() : 0;
          return ta - tb;
        }
        case "recent": {
          const ta = a.lastPaymentAt ? new Date(a.lastPaymentAt).getTime() : 0;
          const tb = b.lastPaymentAt ? new Date(b.lastPaymentAt).getTime() : 0;
          return tb - ta;
        }
        case "overlimit":
          return Number(b.overLimit) - Number(a.overLimit) || b.totalDebt - a.totalDebt;
        default:
          return b.totalDebt - a.totalDebt;
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">ניהול חובות</h1>
        <div className="flex gap-2">
          <a href="/api/reports/debts?format=xlsx">
            <Button variant="secondary">
              <FileDown className="h-5 w-5" aria-hidden />
              Excel
            </Button>
          </a>
          <a href="/api/reports/debts?format=pdf" target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <FileDown className="h-5 w-5" aria-hidden />
              PDF
            </Button>
          </a>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          {
            label: "סה״כ חוב פתוח",
            value: <MoneyDisplay amount={data.totalOpenDebt} tone={data.totalOpenDebt > 0 ? "red" : "neutral"} />,
          },
          { label: "שחקנים עם חוב", value: <span className="num font-semibold">{data.playersWithDebt}</span> },
          { label: "חוב שנוצר היום", value: <MoneyDisplay amount={data.debtCreatedToday} tone="red" /> },
          { label: "חוב שנגבה היום", value: <MoneyDisplay amount={data.debtCollectedToday} tone="green" /> },
          { label: "חורגים ממסגרת", value: <span className="num font-semibold">{data.overLimitCount}</span> },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted">{c.label}</p>
              <p className="mt-1 text-lg">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="מיון" className="w-44">
          <option value="debt">חוב גבוה קודם</option>
          <option value="oldest">חוב ישן קודם</option>
          <option value="recent">שילמו לאחרונה</option>
          <option value="overlimit">חריגה ממסגרת</option>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          שחקנים פעילים בלבד
        </label>
      </div>

      {rows.length === 0 && <EmptyState title="אין חובות פתוחים 🎉" />}

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.playerId} className={r.overLimit ? "border-warn" : ""}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/players/${r.playerId}`} className="font-semibold hover:underline">
                  {r.fullName}
                  {r.nickname && <span className="ms-1 text-sm font-normal text-muted">({r.nickname})</span>}
                </Link>
                <p className="text-xs text-muted">
                  {r.lastPaymentAt ? `תשלום אחרון: ${formatDateTime(r.lastPaymentAt)}` : "לא שילם עדיין"}
                  {r.lastDebtAt && ` · חוב אחרון: ${formatDateTime(r.lastDebtAt)}`}
                </p>
                {r.overLimit && (
                  <span className="mt-1 inline-block rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
                    חריגה ממסגרת אשראי ({r.creditLimit != null && <MoneyDisplay amount={r.creditLimit} className="text-xs" />})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DebtBadge amount={r.totalDebt} />
                {r.phone && (
                  <a
                    href={`https://wa.me/972${r.phone.replace(/[^0-9]/g, "").replace(/^0/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`שליחת הודעת וואטסאפ ל${r.fullName}`}
                  >
                    <Button variant="secondary" size="sm">
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      וואטסאפ
                    </Button>
                  </a>
                )}
                <Link href={`/players/${r.playerId}`}>
                  <Button size="sm">רישום תשלום</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
