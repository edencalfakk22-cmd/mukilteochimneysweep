"use client";

import { ShoppingCart, Banknote, ArrowDownToLine, History, DoorOpen, TrendingUp, TrendingDown } from "lucide-react";
import { MoneyDisplay } from "@/components/money";
import { DebtBadge, PlayerStatusBadge } from "@/components/domain-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionPlayerDto } from "@/components/session/types";

export type PlayerAction = "buyin" | "payment" | "cashout" | "history" | "exit";

/** Large player card with all key numbers and one-tap actions. */
export function PlayerSessionCard({
  player,
  onAction,
  writable,
  canOperate,
}: {
  player: SessionPlayerDto;
  onAction: (action: PlayerAction, player: SessionPlayerDto) => void;
  writable: boolean;
  canOperate: boolean;
}) {
  const s = player.stats;
  const showResult = s.chipsReturned > 0 || player.status !== "ACTIVE";
  const isActive = player.status === "ACTIVE";

  return (
    <Card
      data-testid={`player-card-${player.fullName}`}
      className={cn(!isActive && "opacity-70", player.debt.totalDebt > 0 && "border-debt/40")}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold">
              {player.fullName}
              {player.nickname && <span className="ms-2 text-sm font-normal text-muted">({player.nickname})</span>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <PlayerStatusBadge status={player.status} />
              <DebtBadge amount={player.debt.totalDebt} />
              {player.debt.historicalDebt > 0 && (
                <span className="text-xs text-muted">
                  (מתוכו חוב קודם: <MoneyDisplay amount={player.debt.historicalDebt} tone="red" className="text-xs" />)
                </span>
              )}
              {player.creditLimit != null && player.debt.totalDebt > player.creditLimit && (
                <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
                  חריגה ממסגרת אשראי
                </span>
              )}
            </div>
          </div>
          {s.lastActivityAt && (
            <span className="text-xs text-muted">פעילות אחרונה: {formatTimeAgo(s.lastActivityAt)}</span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">צ׳יפים</dt>
            <dd>
              <MoneyDisplay amount={s.chipsIssued} tone="blue" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">שולם</dt>
            <dd>
              <MoneyDisplay amount={s.paymentsReceived} tone="green" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">הוחזר (פדיון)</dt>
            <dd>
              <MoneyDisplay amount={s.chipsReturned} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">שולם לשחקן</dt>
            <dd>
              <MoneyDisplay amount={s.cashPaidToPlayer} />
            </dd>
          </div>
        </dl>

        {showResult && (
          <p className="mt-2 flex items-center gap-1 text-sm">
            {s.playerPosition >= 0 ? (
              <TrendingUp className="h-4 w-4 text-money-in" aria-hidden />
            ) : (
              <TrendingDown className="h-4 w-4 text-debt" aria-hidden />
            )}
            תוצאת משחק:{" "}
            <span data-testid={`player-result-${player.fullName}`}>
              <MoneyDisplay amount={s.playerPosition} tone="auto" withSign />
            </span>
          </p>
        )}

        {canOperate && (
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            <Button
              variant="secondary"
              className="h-auto flex-col gap-1 py-2 text-xs"
              disabled={!writable || !isActive}
              onClick={() => onAction("buyin", player)}
              data-testid={`action-buyin-${player.fullName}`}
            >
              <ShoppingCart className="h-5 w-5 text-chips" aria-hidden />
              קנייה
            </Button>
            <Button
              variant="secondary"
              className="h-auto flex-col gap-1 py-2 text-xs"
              disabled={!writable}
              onClick={() => onAction("payment", player)}
              data-testid={`action-payment-${player.fullName}`}
            >
              <Banknote className="h-5 w-5 text-money-in" aria-hidden />
              תשלום
            </Button>
            <Button
              variant="secondary"
              className="h-auto flex-col gap-1 py-2 text-xs"
              disabled={!writable || !isActive}
              onClick={() => onAction("cashout", player)}
              data-testid={`action-cashout-${player.fullName}`}
            >
              <ArrowDownToLine className="h-5 w-5" aria-hidden />
              פדיון
            </Button>
            <Button
              variant="secondary"
              className="h-auto flex-col gap-1 py-2 text-xs"
              onClick={() => onAction("history", player)}
              data-testid={`action-history-${player.fullName}`}
            >
              <History className="h-5 w-5" aria-hidden />
              היסטוריה
            </Button>
            <Button
              variant="secondary"
              className="h-auto flex-col gap-1 py-2 text-xs"
              disabled={!writable || !isActive}
              onClick={() => onAction("exit", player)}
              data-testid={`action-exit-${player.fullName}`}
            >
              <DoorOpen className="h-5 w-5 text-warn" aria-hidden />
              יציאה
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
