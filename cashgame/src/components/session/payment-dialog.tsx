"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput } from "@/components/money";
import { SummaryRow } from "@/components/session/approval";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { paymentMethodLabels, payableMethods } from "@/lib/labels";
import type { SessionPlayerDto } from "@/components/session/types";
import type { PaymentMethod } from "@prisma/client";

type Strategy = "OLDEST_FIRST" | "SESSION_FIRST" | "HISTORICAL_ONLY";

interface PaymentResultDto {
  amount: number;
  toSessionDebt: number;
  toHistoricalDebt: number;
  creditCreated: number;
  after: { totalDebt: number };
}

/** Standalone payment (debt repayment) inside a session. */
export function PaymentDialog({
  sessionId,
  player,
  open,
  onOpenChange,
  onDone,
}: {
  sessionId: string;
  player: SessionPlayerDto | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [strategy, setStrategy] = React.useState<Strategy>("OLDEST_FIRST");
  const [notes, setNotes] = React.useState("");
  const [allowCredit, setAllowCredit] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [excessPrompt, setExcessPrompt] = React.useState<number | null>(null);
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.
  useUnsavedGuard(open && amount != null && !saving);

  if (!player) return null;

  const debtBefore = player.debt.totalDebt;
  const debtAfterPreview = Math.max(0, debtBefore - (amount ?? 0));

  async function submit() {
    if (!player) return;
    if (!amount || amount <= 0) {
      setError("יש להזין סכום תשלום");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api<PaymentResultDto & { duplicate: boolean }>(
        `/api/sessions/${sessionId}/payment`,
        {
          method: "POST",
          body: {
            idempotencyKey: idemKey.current,
            playerId: player.playerId,
            amount,
            paymentMethod: method,
            strategy,
            allowCreditCreation: allowCredit || undefined,
            notes: notes || undefined,
          },
        },
      );
      toast.success(
        <span>
          תשלום נרשם — {player.fullName}: <MoneyDisplay amount={result.amount} tone="green" />
          {result.creditCreated > 0 && (
            <>
              {" "}
              (נוצרה יתרת זכות <MoneyDisplay amount={result.creditCreated} />)
            </>
          )}
        </span>,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        const details = e.details as { kind?: string; excess?: number } | null;
        if (details?.kind === "CREATE_CREDIT") {
          setExcessPrompt(details.excess ?? 0);
          setError(null);
        } else {
          setError(e.message);
        }
      } else {
        setError(e instanceof ApiError ? e.message : "אירעה שגיאה — נסה שוב");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title={`תשלום — ${player.fullName}`} onInteractOutside={(e) => e.preventDefault()}>
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-muted p-3">
            <SummaryRow label="חוב נוכחי (סה״כ)">
              <MoneyDisplay amount={debtBefore} tone={debtBefore > 0 ? "red" : "neutral"} />
            </SummaryRow>
            <SummaryRow label="מתוכו בסשן הנוכחי">
              <MoneyDisplay amount={player.debt.sessionDebt} />
            </SummaryRow>
            <SummaryRow label="חוב קודם">
              <MoneyDisplay amount={player.debt.historicalDebt} />
            </SummaryRow>
          </div>

          <MoneyInput id="pay-amount" label="סכום התשלום" valueAgorot={amount} onChangeAgorot={setAmount} autoFocus />

          <div>
            <Label htmlFor="pay-method">אמצעי תשלום</Label>
            <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {payableMethods.map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="pay-strategy">ייעוד התשלום</Label>
            <Select id="pay-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              <option value="OLDEST_FIRST">חוב ישן קודם (ברירת מחדל)</option>
              <option value="SESSION_FIRST">חוב הסשן הנוכחי קודם</option>
              <option value="HISTORICAL_ONLY">חוב קודם בלבד</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="pay-notes">הערות (לא חובה)</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {amount != null && amount > 0 && (
            <div className="rounded-lg bg-surface-muted p-3" data-testid="payment-preview">
              <SummaryRow label="חוב לפני">
                <MoneyDisplay amount={debtBefore} tone={debtBefore > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="תשלום">
                <MoneyDisplay amount={amount} tone="green" />
              </SummaryRow>
              <SummaryRow label="חוב אחרי" strong>
                <MoneyDisplay amount={debtAfterPreview} tone={debtAfterPreview > 0 ? "red" : "neutral"} />
              </SummaryRow>
            </div>
          )}

          {excessPrompt != null && (
            <div className="space-y-2 rounded-lg border border-warn bg-warn-bg p-3">
              <p className="text-sm font-medium text-warn">
                התשלום גבוה מהחוב הפתוח ב־
                <MoneyDisplay amount={excessPrompt} />. ליצור יתרת זכות לשחקן?
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={allowCredit}
                  onChange={(e) => setAllowCredit(e.target.checked)}
                />
                כן — צור יתרת זכות בסך <MoneyDisplay amount={excessPrompt} />
              </label>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}

          <Button size="lg" className="w-full" onClick={submit} loading={saving} data-testid="payment-confirm">
            רישום תשלום
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
