"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput } from "@/components/money";
import { SummaryRow } from "@/components/session/approval";
import { paymentMethodLabels, payableMethods, countTypeLabels } from "@/lib/labels";
import type { SessionStateDto } from "@/components/session/types";
import type { PaymentMethod } from "@prisma/client";
import { formatTime } from "@/lib/format";

type Mode = "DEPOSIT" | "WITHDRAWAL" | "EXPENSE" | "COUNT";

/** CashDrawerSummary + drawer operations (deposit/withdrawal/expense/interim count). */
export function CashDrawerDialog({
  state,
  open,
  onOpenChange,
  onDone,
}: {
  state: SessionStateDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>("COUNT");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.

  async function submit() {
    if (amount == null || amount < 0) {
      setError("יש להזין סכום");
      return;
    }
    if (mode !== "COUNT" && reason.trim().length < 2) {
      setError("חובה לציין סיבה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === "COUNT") {
        await api(`/api/sessions/${state.session.id}/drawer`, {
          method: "POST",
          body: { action: "count", countedAmount: amount, notes: reason || undefined },
        });
        toast.success("ספירת ביניים נרשמה");
      } else {
        await api(`/api/sessions/${state.session.id}/drawer`, {
          method: "POST",
          body: {
            action: "op",
            idempotencyKey: idemKey.current,
            kind: mode,
            amount,
            reason: reason.trim(),
            paymentMethod: mode === "EXPENSE" ? method : undefined,
          },
        });
        toast.success("פעולת הקופה נרשמה");
      }
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "אירעה שגיאה — נסה שוב");
    } finally {
      setSaving(false);
    }
  }

  const t = state.totals;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title="קופה" description="מצב המזומן הצפוי ופעולות קופה" className="sm:max-w-xl">
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-muted p-3" data-testid="drawer-summary">
            <SummaryRow label="מזומן פתיחה">
              <MoneyDisplay amount={state.session.openingCashAmount} />
            </SummaryRow>
            <SummaryRow label="+ תשלומים במזומן">
              <MoneyDisplay amount={t.paymentsIn.CASH} tone="green" />
            </SummaryRow>
            <SummaryRow label="+ הפקדות לקופה">
              <MoneyDisplay amount={t.drawerDeposits} />
            </SummaryRow>
            <SummaryRow label="- תשלומים לשחקנים במזומן">
              <MoneyDisplay amount={t.paidOut.CASH} />
            </SummaryRow>
            <SummaryRow label="- הוצאות במזומן">
              <MoneyDisplay amount={t.cashExpenses} />
            </SummaryRow>
            <SummaryRow label="- משיכות מהקופה">
              <MoneyDisplay amount={t.drawerWithdrawals} />
            </SummaryRow>
            <SummaryRow label="מזומן צפוי בקופה" strong>
              <span data-testid="drawer-expected">
                <MoneyDisplay amount={state.expectedCash} />
              </span>
            </SummaryRow>
          </div>

          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="mb-1 font-medium">תקבולים שאינם מזומן (לא משפיעים על הקופה):</p>
            <div className="flex flex-wrap gap-3 text-muted">
              <span>
                ביט: <MoneyDisplay amount={t.paymentsIn.BIT} />
              </span>
              <span>
                העברות: <MoneyDisplay amount={t.paymentsIn.BANK_TRANSFER} />
              </span>
              <span>
                אשראי: <MoneyDisplay amount={t.paymentsIn.CREDIT_CARD} />
              </span>
              <span>
                אחר: <MoneyDisplay amount={t.paymentsIn.OTHER} />
              </span>
            </div>
          </div>

          <div role="group" aria-label="סוג פעולה" className="grid grid-cols-4 gap-2">
            {(
              [
                ["COUNT", "ספירה"],
                ["DEPOSIT", "הפקדה"],
                ["WITHDRAWAL", "משיכה"],
                ["EXPENSE", "הוצאה"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <Button
                key={m}
                variant={mode === m ? "primary" : "secondary"}
                onClick={() => setMode(m)}
                data-testid={`drawer-mode-${m}`}
              >
                {label}
              </Button>
            ))}
          </div>

          <MoneyInput
            id="drawer-amount"
            label={mode === "COUNT" ? "סכום שנספר בפועל" : "סכום"}
            valueAgorot={amount}
            onChangeAgorot={setAmount}
          />

          {mode === "EXPENSE" && (
            <div>
              <Label htmlFor="drawer-method">אמצעי תשלום</Label>
              <Select id="drawer-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {payableMethods.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabels[m]}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="drawer-reason">{mode === "COUNT" ? "הערות" : "סיבה (חובה)"}</Label>
            <Textarea id="drawer-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {mode === "COUNT" && amount != null && (
            <p className="rounded-lg bg-surface-muted p-3 text-sm">
              הפרש מול צפוי:{" "}
              <MoneyDisplay amount={amount - state.expectedCash} tone={amount - state.expectedCash === 0 ? "green" : "red"} withSign />
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}

          <Button size="lg" className="w-full" onClick={submit} loading={saving} data-testid="drawer-submit">
            רישום
          </Button>

          {state.cashCounts.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">ספירות קודמות</p>
              <ul className="space-y-1 text-sm">
                {state.cashCounts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border border-border p-2">
                    <span>
                      {countTypeLabels[c.countType]} · {formatTime(c.createdAt)}
                    </span>
                    <span className="flex items-center gap-2">
                      <MoneyDisplay amount={c.countedAmount} />
                      {c.difference !== 0 && <MoneyDisplay amount={c.difference} tone="red" withSign className="text-xs" />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
