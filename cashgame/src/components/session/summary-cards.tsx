"use client";

import { Coins, Banknote, AlertCircle, Wallet, Users, ArrowDownToLine, Scale } from "lucide-react";
import { MoneyDisplay } from "@/components/money";
import { cn } from "@/lib/utils";
import type { SessionStateDto } from "@/components/session/types";

/** The seven live summary cards (sticky strip on mobile). */
export function SessionSummaryCards({ state }: { state: SessionStateDto }) {
  const interimDiff = state.cashCounts.filter((c) => c.countType === "INTERIM").at(-1);
  const hasWarning = interimDiff != null && interimDiff.difference !== 0;

  const cards: {
    key: string;
    label: string;
    icon: React.ReactNode;
    value: React.ReactNode;
    className?: string;
  }[] = [
    {
      key: "chips",
      label: "צ׳יפים שהונפקו",
      icon: <Coins className="h-4 w-4 text-chips" aria-hidden />,
      value: <MoneyDisplay amount={state.totals.chipsIssued} tone="blue" />,
    },
    {
      key: "payments",
      label: "תשלומים שהתקבלו",
      icon: <Banknote className="h-4 w-4 text-money-in" aria-hidden />,
      value: <MoneyDisplay amount={state.totals.paymentsInTotal} tone="green" />,
    },
    {
      key: "debt",
      label: "חוב פתוח בסשן",
      icon: <AlertCircle className="h-4 w-4 text-debt" aria-hidden />,
      value: (
        <span data-testid="summary-session-debt">
          <MoneyDisplay amount={state.openSessionDebt} tone={state.openSessionDebt > 0 ? "red" : "neutral"} />
        </span>
      ),
    },
    {
      key: "cash",
      label: "מזומן צפוי בקופה",
      icon: <Wallet className="h-4 w-4" aria-hidden />,
      value: (
        <span data-testid="summary-expected-cash">
          <MoneyDisplay amount={state.expectedCash} />
        </span>
      ),
    },
    {
      key: "players",
      label: "שחקנים פעילים",
      icon: <Users className="h-4 w-4" aria-hidden />,
      value: <span className="num font-semibold">{state.activePlayers}</span>,
    },
    {
      key: "cashout",
      label: "סה״כ פדיונות",
      icon: <ArrowDownToLine className="h-4 w-4" aria-hidden />,
      value: <MoneyDisplay amount={state.totals.chipsReturned} />,
    },
  ];

  if (hasWarning) {
    cards.push({
      key: "reconciliation",
      label: "הפרש בספירת ביניים",
      icon: <Scale className="h-4 w-4 text-warn" aria-hidden />,
      value: <MoneyDisplay amount={interimDiff.difference} tone="red" withSign />,
      className: "border-warn bg-warn-bg",
    });
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 overflow-x-auto bg-background px-4 py-2 md:static md:mx-0 md:px-0">
      <div className="flex gap-2 md:grid md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div
            key={c.key}
            className={cn(
              "min-w-36 flex-shrink-0 rounded-card border border-border bg-surface p-3 md:min-w-0",
              c.className,
            )}
          >
            <p className="flex items-center gap-1.5 text-xs text-muted">
              {c.icon}
              {c.label}
            </p>
            <p className="mt-1 text-lg">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
