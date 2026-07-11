"use client";

import * as React from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/money";
import { PaymentMethodBadge } from "@/components/domain-badges";
import { ManagerApprovalFields, type ApprovalValue } from "@/components/session/approval";
import { transactionTypeLabels } from "@/lib/labels";
import { formatTime } from "@/lib/format";
import type { LedgerRowDto, SessionPlayerDto } from "@/components/session/types";

/** Per-player (or full session) transaction timeline with reversal. */
export function TransactionHistoryDialog({
  player,
  ledger,
  canReverse,
  open,
  onOpenChange,
  onDone,
}: {
  player: SessionPlayerDto | null; // null = whole session
  ledger: LedgerRowDto[];
  canReverse: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [reversing, setReversing] = React.useState<LedgerRowDto | null>(null);

  const rows = React.useMemo(
    () => (player ? ledger.filter((t) => t.playerId === player.playerId) : ledger),
    [ledger, player],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={player ? `היסטוריה — ${player.fullName}` : "היסטוריית פעולות"}
          className="sm:max-w-2xl"
        >
          <ol className="max-h-[60dvh] space-y-2 overflow-y-auto" aria-label="ציר זמן פעולות">
            {rows.length === 0 && <p className="p-4 text-center text-muted">אין פעולות עדיין</p>}
            {rows.map((t) => (
              <li
                key={t.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 ${
                  t.status === "REVERSED" ? "opacity-60" : ""
                }`}
                data-testid={`tx-${t.type}-${t.status}`}
              >
                <div>
                  <p className="font-medium">
                    {transactionTypeLabels[t.type]}
                    {t.status === "REVERSED" && (
                      <span className="ms-2 rounded-full bg-debt-bg px-2 py-0.5 text-xs font-semibold text-debt">
                        בוטלה
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {formatTime(t.createdAt)} · {t.createdByName ?? ""}
                    {t.notes && ` · ${t.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentMethodBadge method={t.paymentMethod} />
                  <MoneyDisplay amount={t.amount} className={t.status === "REVERSED" ? "line-through" : ""} />
                  {canReverse && t.status === "ACTIVE" && t.type !== "REVERSAL" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`ביטול ${transactionTypeLabels[t.type]}`}
                      onClick={() => setReversing(t)}
                      data-testid={`reverse-${t.id}`}
                    >
                      <Undo2 className="h-4 w-4" aria-hidden />
                      ביטול
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>

      <ReversalDialog
        key={reversing?.id ?? "none"}
        tx={reversing}
        open={reversing != null}
        onOpenChange={(o) => !o && setReversing(null)}
        onDone={() => {
          setReversing(null);
          onDone();
        }}
      />
    </>
  );
}

/** Reversal (void) with mandatory reason and optional manager approval. */
export function ReversalDialog({
  tx,
  open,
  onOpenChange,
  onDone,
}: {
  tx: LedgerRowDto | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [wholeBatch, setWholeBatch] = React.useState(true);
  const [needApproval, setNeedApproval] = React.useState(false);
  const [approval, setApproval] = React.useState<ApprovalValue>({ username: "", secret: "" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per target tx: mounted with key={tx.id} by the caller.

  if (!tx) return null;

  async function submit() {
    if (!tx) return;
    if (reason.trim().length < 3) {
      setError("חובה לציין סיבת ביטול");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/transactions/reverse", {
        method: "POST",
        body: {
          idempotencyKey: idemKey.current,
          ...(wholeBatch && tx.batchId ? { batchId: tx.batchId } : { transactionId: tx.id }),
          reason: reason.trim(),
          approval: needApproval && approval.username ? approval : undefined,
        },
      });
      toast.success("הפעולה בוטלה ונרשמה ביומן");
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "APPROVAL_REQUIRED") {
        setNeedApproval(true);
        setError(e.message);
      } else {
        setError(e instanceof ApiError ? e.message : "אירעה שגיאה — נסה שוב");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        title={`ביטול פעולה — ${transactionTypeLabels[tx.type]}`}
        description="הפעולה המקורית תישאר בהיסטוריה ותסומן כמבוטלת"
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-surface-muted p-3">
            {transactionTypeLabels[tx.type]} · <MoneyDisplay amount={tx.amount} />
          </p>

          {tx.batchId && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={wholeBatch}
                onChange={(e) => setWholeBatch(e.target.checked)}
              />
              ביטול הפעולה המלאה (כולל תשלום/חוב שנוצרו יחד איתה) — מומלץ
            </label>
          )}

          <div>
            <Label htmlFor="reversal-reason">סיבת הביטול (חובה)</Label>
            <Textarea
              id="reversal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="reversal-reason"
            />
          </div>

          {needApproval && <ManagerApprovalFields value={approval} onChange={setApproval} />}

          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)} disabled={saving}>
              חזרה
            </Button>
            <Button variant="danger" size="lg" onClick={submit} loading={saving} data-testid="reversal-confirm">
              ביטול הפעולה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
