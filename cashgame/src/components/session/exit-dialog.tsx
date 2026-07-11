"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/money";
import { SummaryRow } from "@/components/session/approval";
import type { SessionPlayerDto } from "@/components/session/types";

/** Player exit: settlement review with explicit declarations. */
export function PlayerExitDialog({
  sessionId,
  player,
  open,
  onOpenChange,
  onDone,
  onNeedCashOut,
}: {
  sessionId: string;
  player: SessionPlayerDto | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  onNeedCashOut: (player: SessionPlayerDto) => void;
}) {
  const [declareNoChips, setDeclareNoChips] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fresh state per open: the parent remounts this dialog with a changing key.

  if (!player) return null;
  const s = player.stats;
  const hasUnsettled = s.unsettledChips > 0;
  const leavesWithDebt = player.debt.totalDebt > 0;

  async function submit() {
    if (!player) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/sessions/${sessionId}/exit`, {
        method: "POST",
        body: {
          playerId: player.playerId,
          declareNoChips: declareNoChips || undefined,
          note: note || undefined,
        },
      });
      toast.success(`${player.fullName} יצא מהסשן`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "אירעה שגיאה — נסה שוב");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title={`יציאת שחקן — ${player.fullName}`} description="סקירת התחשבנות לפני יציאה">
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-muted p-3" data-testid="exit-summary">
            <SummaryRow label="צ׳יפים שהונפקו">
              <MoneyDisplay amount={s.chipsIssued} tone="blue" />
            </SummaryRow>
            <SummaryRow label="תשלומים">
              <MoneyDisplay amount={s.paymentsReceived} tone="green" />
            </SummaryRow>
            <SummaryRow label="צ׳יפים שהוחזרו">
              <MoneyDisplay amount={s.chipsReturned} />
            </SummaryRow>
            <SummaryRow label="שולם לשחקן">
              <MoneyDisplay amount={s.cashPaidToPlayer} />
            </SummaryRow>
            <SummaryRow label="חוב מהסשן">
              <MoneyDisplay amount={s.sessionDebtOutstanding} tone={s.sessionDebtOutstanding > 0 ? "red" : "neutral"} />
            </SummaryRow>
            <SummaryRow label="חוב קודם">
              <MoneyDisplay amount={player.debt.historicalDebt} tone={player.debt.historicalDebt > 0 ? "red" : "neutral"} />
            </SummaryRow>
            <SummaryRow label="צ׳יפים שטרם הוחזרו">
              <MoneyDisplay amount={s.unsettledChips} tone={s.unsettledChips > 0 ? "red" : "neutral"} />
            </SummaryRow>
            <SummaryRow label="תוצאת משחק" strong>
              <MoneyDisplay amount={s.playerPosition} tone="auto" withSign />
            </SummaryRow>
          </div>

          {hasUnsettled && (
            <div className="space-y-3 rounded-lg border border-warn bg-warn-bg p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                לשחקן צ׳יפים בשווי <MoneyDisplay amount={s.unsettledChips} /> שטרם הוחזרו. יש לבצע פדיון,
                או להצהיר שאין צ׳יפים להחזרה (השחקן הפסיד אותם).
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                    onNeedCashOut(player);
                  }}
                >
                  ביצוע פדיון עכשיו
                </Button>
                <label className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={declareNoChips}
                    onChange={(e) => setDeclareNoChips(e.target.checked)}
                    data-testid="declare-no-chips"
                  />
                  אין צ׳יפים להחזרה — השחקן הפסיד את הצ׳יפים
                </label>
              </div>
            </div>
          )}

          {leavesWithDebt && (
            <p className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              השחקן יוצא עם חוב פתוח של <MoneyDisplay amount={player.debt.totalDebt} tone="red" />.
            </p>
          )}

          <div>
            <Label htmlFor="exit-note">הערה (לא חובה)</Label>
            <Input id="exit-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}

          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            loading={saving}
            disabled={hasUnsettled && !declareNoChips}
            data-testid="exit-confirm"
          >
            {leavesWithDebt ? "יציאה עם חוב" : "אישור יציאה"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
