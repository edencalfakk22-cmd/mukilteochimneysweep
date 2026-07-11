"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Wallet, History, DoorClosed, FileBarChart, RotateCcw, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Label } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { SessionStatusBadge } from "@/components/domain-badges";
import { formatDateTime } from "@/lib/format";
import { SessionSummaryCards } from "@/components/session/summary-cards";
import { PlayerSessionCard, type PlayerAction } from "@/components/session/player-card";
import { BuyInDialog } from "@/components/session/buyin-dialog";
import { PaymentDialog } from "@/components/session/payment-dialog";
import { CashOutDialog } from "@/components/session/cashout-dialog";
import { PlayerExitDialog } from "@/components/session/exit-dialog";
import { AddPlayerDialog } from "@/components/session/add-player-dialog";
import { TransactionHistoryDialog } from "@/components/session/history-dialog";
import { CashDrawerDialog } from "@/components/session/drawer-dialog";
import { isWritableStatus, type SessionPlayerDto, type SessionStateDto } from "@/components/session/types";

type SortKey = "name" | "debt" | "activity" | "chips";
type FilterKey = "all" | "active" | "left" | "debt" | "paid";

export default function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: state, error, loading, refresh } = useApi<SessionStateDto>(
    id ? `/api/sessions/${id}` : null,
    { pollMs: 10000 },
  );

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("activity");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [dialog, setDialogState] = React.useState<PlayerAction | "add" | "drawer" | "sessionHistory" | "reopen" | null>(null);
  const [target, setTarget] = React.useState<SessionPlayerDto | null>(null);
  // Changing key remounts dialogs so every open starts with fresh form state.
  const [nonce, setNonce] = React.useState(0);
  const [reopenReason, setReopenReason] = React.useState("");
  const [reopening, setReopening] = React.useState(false);

  const setDialog = React.useCallback((next: typeof dialog) => {
    if (next !== null) setNonce((n) => n + 1);
    setDialogState(next);
  }, []);

  if (loading && !state) return <LoadingSkeleton rows={5} />;
  if (error && !state) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!state) return null;

  const writable = isWritableStatus(state.session.status);
  const role = state.viewer.role;
  const canOperate = role === "OWNER" || role === "MANAGER" || role === "OPERATOR";
  const canManage = role === "OWNER" || role === "MANAGER";
  const isClosed = state.session.status === "CLOSED";

  function onAction(action: PlayerAction, player: SessionPlayerDto) {
    setTarget(player);
    setDialog(action);
  }

  const filtered = state.players
    .filter((p) => {
      if (filter === "active" && p.status !== "ACTIVE") return false;
      if (filter === "left" && p.status === "ACTIVE") return false;
      if (filter === "debt" && p.debt.totalDebt <= 0) return false;
      if (filter === "paid" && p.debt.totalDebt > 0) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          (p.nickname ?? "").toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "name":
          return a.fullName.localeCompare(b.fullName, "he");
        case "debt":
          return b.debt.totalDebt - a.debt.totalDebt;
        case "chips":
          return b.stats.chipsIssued - a.stats.chipsIssued;
        default: {
          const ta = a.stats.lastActivityAt ? new Date(a.stats.lastActivityAt).getTime() : 0;
          const tb = b.stats.lastActivityAt ? new Date(b.stats.lastActivityAt).getTime() : 0;
          return tb - ta;
        }
      }
    });

  async function reopen() {
    if (reopenReason.trim().length < 3) {
      toast.error("חובה לציין סיבה לפתיחה מחדש");
      return;
    }
    setReopening(true);
    try {
      await api(`/api/sessions/${state!.session.id}/reopen`, {
        method: "POST",
        body: { reason: reopenReason.trim() },
      });
      toast.success("הסשן נפתח מחדש");
      setDialog(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={state.session.status} />
            <h1 className="text-2xl font-bold">{state.session.name}</h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            נפתח {formatDateTime(state.session.startedAt)} ע״י {state.session.openedBy.name}
            {state.session.endedAt && ` · נסגר ${formatDateTime(state.session.endedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog("drawer")} data-testid="open-drawer">
            <Wallet className="h-5 w-5" aria-hidden />
            קופה
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTarget(null);
              setDialog("sessionHistory");
            }}
            data-testid="open-session-history"
          >
            <History className="h-5 w-5" aria-hidden />
            היסטוריה
          </Button>
          <Link href={`/sessions/${state.session.id}/report`}>
            <Button variant="secondary">
              <FileBarChart className="h-5 w-5" aria-hidden />
              דוח
            </Button>
          </Link>
          {writable && canManage && (
            <Button variant="warn" onClick={() => router.push(`/sessions/${state.session.id}/close`)} data-testid="close-session">
              <DoorClosed className="h-5 w-5" aria-hidden />
              סגירת סשן
            </Button>
          )}
          {isClosed && canManage && (
            <Button variant="secondary" onClick={() => setDialog("reopen")} data-testid="reopen-session">
              <RotateCcw className="h-5 w-5" aria-hidden />
              פתיחה מחדש
            </Button>
          )}
        </div>
      </div>

      {isClosed && (
        <p className="rounded-lg bg-surface-muted p-3 text-sm font-medium">
          🔒 הסשן סגור לצפייה בלבד. ניתן לפתוח מחדש בהרשאת מנהל.
        </p>
      )}

      <SessionSummaryCards state={state} />

      {/* Search / sort / filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            placeholder="חיפוש שחקן..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש שחקן בסשן"
            className="h-11"
          />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} aria-label="סינון" className="h-11 w-36">
          <option value="all">כל השחקנים</option>
          <option value="active">פעילים בלבד</option>
          <option value="left">עזבו</option>
          <option value="debt">עם חוב</option>
          <option value="paid">ללא חוב</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="מיון" className="h-11 w-40">
          <option value="activity">פעילות אחרונה</option>
          <option value="name">שם</option>
          <option value="debt">חוב גבוה</option>
          <option value="chips">הכי הרבה צ׳יפים</option>
        </Select>
        {canOperate && writable && (
          <Button onClick={() => setDialog("add")} className="hidden md:inline-flex" data-testid="add-player">
            <UserPlus className="h-5 w-5" aria-hidden />
            הוספת שחקן
          </Button>
        )}
      </div>

      {/* Player cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title={state.players.length === 0 ? "אין שחקנים בסשן" : "אין תוצאות לסינון הנוכחי"}
          description={state.players.length === 0 ? "הוסף שחקן ראשון כדי להתחיל" : undefined}
          action={
            canOperate && writable && state.players.length === 0 ? (
              <Button onClick={() => setDialog("add")}>
                <UserPlus className="h-5 w-5" aria-hidden />
                הוספת שחקן
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((p) => (
            <PlayerSessionCard key={p.playerId} player={p} onAction={onAction} writable={writable} canOperate={canOperate} />
          ))}
        </div>
      )}

      {/* Sticky mobile add-player button */}
      {canOperate && writable && (
        <div className="fixed inset-x-4 bottom-16 z-30 pb-[env(safe-area-inset-bottom)] md:hidden">
          <Button size="lg" className="w-full shadow-lg" onClick={() => setDialog("add")} data-testid="add-player-mobile">
            <UserPlus className="h-5 w-5" aria-hidden />
            הוספת שחקן
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <AddPlayerDialog
        key={`AddPlayerDialog-${nonce}`}
        sessionId={state.session.id}
        existingPlayers={state.players}
        settings={state.settings}
        open={dialog === "add"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />
      <BuyInDialog
        key={`BuyInDialog-${nonce}`}
        sessionId={state.session.id}
        player={target}
        settings={state.settings}
        open={dialog === "buyin"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />
      <PaymentDialog
        key={`PaymentDialog-${nonce}`}
        sessionId={state.session.id}
        player={target}
        open={dialog === "payment"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />
      <CashOutDialog
        key={`CashOutDialog-${nonce}`}
        sessionId={state.session.id}
        player={target}
        settings={state.settings}
        open={dialog === "cashout"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />
      <PlayerExitDialog
        key={`PlayerExitDialog-${nonce}`}
        sessionId={state.session.id}
        player={target}
        open={dialog === "exit"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
        onNeedCashOut={(p) => {
          setTarget(p);
          setDialog("cashout");
        }}
      />
      <TransactionHistoryDialog
        key={`TransactionHistoryDialog-${nonce}`}
        player={dialog === "sessionHistory" ? null : target}
        ledger={state.ledger}
        canReverse={canOperate && writable}
        open={dialog === "history" || dialog === "sessionHistory"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />
      <CashDrawerDialog
        key={`CashDrawerDialog-${nonce}`}
        state={state}
        open={dialog === "drawer"}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={refresh}
      />

      {/* Reopen dialog */}
      <Dialog open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="פתיחת סשן מחדש" description="הפעולה תתועד ביומן הביקורת">
          <div className="space-y-4">
            <div>
              <Label htmlFor="reopen-reason">סיבה (חובה)</Label>
              <Textarea
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                data-testid="reopen-reason"
              />
            </div>
            <Button size="lg" className="w-full" onClick={reopen} loading={reopening} data-testid="reopen-confirm">
              פתיחה מחדש
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
