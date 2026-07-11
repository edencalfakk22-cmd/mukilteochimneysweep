"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput, QuickAmountButtons } from "@/components/money";
import { ManagerApprovalFields, SummaryRow, type ApprovalValue } from "@/components/session/approval";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { paymentMethodLabels, payableMethods } from "@/lib/labels";
import type { SessionPlayerDto, SessionSettingsDto } from "@/components/session/types";
import type { PaymentMethod } from "@prisma/client";

type PayMode = "FULL" | "PARTIAL" | "NONE";

export function BuyInDialog({
  sessionId,
  player,
  settings,
  open,
  onOpenChange,
  onDone,
}: {
  sessionId: string;
  player: SessionPlayerDto | null;
  settings: SessionSettingsDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [chipAmount, setChipAmount] = React.useState<number | null>(null);
  const [payMode, setPayMode] = React.useState<PayMode>("FULL");
  const [paidNow, setPaidNow] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [notes, setNotes] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [step, setStep] = React.useState<"form" | "confirm">("form");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needHighConfirm, setNeedHighConfirm] = React.useState(false);
  const [needOverLimitConfirm, setNeedOverLimitConfirm] = React.useState(false);
  const [needApproval, setNeedApproval] = React.useState(false);
  const [approval, setApproval] = React.useState<ApprovalValue>({ username: "", secret: "" });
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.
  useUnsavedGuard(open && chipAmount != null && !saving);

  if (!player) return null;

  const effectivePaid = payMode === "FULL" ? (chipAmount ?? 0) : payMode === "NONE" ? 0 : (paidNow ?? 0);
  const newDebt = Math.max(0, (chipAmount ?? 0) - effectivePaid);
  const isRebuy = player.stats.chipsIssued > 0;

  function toConfirm() {
    setError(null);
    if (!chipAmount || chipAmount <= 0) {
      setError("יש להזין סכום צ׳יפים");
      return;
    }
    if (effectivePaid > chipAmount) {
      setError("הסכום ששולם גבוה מסכום הקנייה — לפירעון חוב השתמש בכפתור ״תשלום״");
      return;
    }
    setStep("confirm");
  }

  async function submit() {
    if (!player || !chipAmount) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/sessions/${sessionId}/buy-in`, {
        method: "POST",
        body: {
          idempotencyKey: idemKey.current,
          playerId: player.playerId,
          chipAmount,
          paidNow: effectivePaid,
          paymentMethod: effectivePaid > 0 ? method : undefined,
          notes: notes || undefined,
          reference: reference || undefined,
          confirmHighAmount: needHighConfirm || undefined,
          confirmOverLimit: needOverLimitConfirm || undefined,
          approval: needApproval && approval.username ? approval : undefined,
        },
      });
      toast.success(
        <span>
          {isRebuy ? "קנייה חוזרת" : "קנייה"} נרשמה — {player.fullName}:{" "}
          <MoneyDisplay amount={chipAmount} tone="blue" />
        </span>,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        const kind = (e.details as { kind?: string } | null)?.kind;
        if (kind === "HIGH_AMOUNT") {
          setNeedHighConfirm(true);
          setError("הסכום גבוה מסף האזהרה — אשר שוב כדי להמשיך");
        } else if (kind === "OVER_CREDIT_LIMIT") {
          setNeedOverLimitConfirm(true);
          setError("השחקן יחרוג ממסגרת האשראי — אשר שוב כדי להמשיך");
        } else {
          setError(e.message);
        }
      } else if (e instanceof ApiError && e.code === "APPROVAL_REQUIRED") {
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
        title={isRebuy ? `קנייה חוזרת — ${player.fullName}` : `קנייה — ${player.fullName}`}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {step === "form" ? (
          <div className="space-y-4">
            <QuickAmountButtons
              amounts={settings.defaultBuyInButtons}
              selected={chipAmount}
              onPick={(a) => setChipAmount(a)}
            />
            <MoneyInput
              id="buyin-chips"
              label="סכום צ׳יפים"
              valueAgorot={chipAmount}
              onChangeAgorot={setChipAmount}
              autoFocus
            />

            <div role="group" aria-label="אופן תשלום" className="grid grid-cols-3 gap-2">
              {(
                [
                  ["FULL", "שולם הכול"],
                  ["PARTIAL", "שולם חלקית"],
                  ["NONE", "לא שולם"],
                ] as [PayMode, string][]
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  type="button"
                  variant={payMode === mode ? "primary" : "secondary"}
                  onClick={() => setPayMode(mode)}
                  data-testid={`paymode-${mode}`}
                >
                  {label}
                </Button>
              ))}
            </div>

            {payMode === "PARTIAL" && (
              <MoneyInput id="buyin-paid" label="סכום ששולם עכשיו" valueAgorot={paidNow} onChangeAgorot={setPaidNow} />
            )}

            {payMode !== "NONE" && (
              <div>
                <Label htmlFor="buyin-method">אמצעי תשלום</Label>
                <Select id="buyin-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {payableMethods.map((m) => (
                    <option key={m} value={m}>
                      {paymentMethodLabels[m]}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {(method === "BANK_TRANSFER" || method === "BIT") && payMode !== "NONE" && (
              <div>
                <Label htmlFor="buyin-ref">אסמכתה (לא חובה)</Label>
                <Input id="buyin-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            )}

            <div>
              <Label htmlFor="buyin-notes">הערות (לא חובה)</Label>
              <Input id="buyin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
                {error}
              </p>
            )}

            <Button size="lg" className="w-full" onClick={toConfirm} data-testid="buyin-continue">
              המשך לאישור
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-muted p-3 text-base" data-testid="buyin-summary">
              <SummaryRow label="צ׳יפים">
                <MoneyDisplay amount={chipAmount ?? 0} tone="blue" />
              </SummaryRow>
              <SummaryRow label={`שולם עכשיו (${paymentMethodLabels[effectivePaid > 0 ? method : "UNPAID"]})`}>
                <MoneyDisplay amount={effectivePaid} tone="green" />
              </SummaryRow>
              <SummaryRow label="חוב חדש מהקנייה">
                <MoneyDisplay amount={newDebt} tone={newDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="חוב קודם">
                <MoneyDisplay amount={player.debt.totalDebt} tone={player.debt.totalDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="חוב כולל לאחר הפעולה" strong>
                <MoneyDisplay
                  amount={player.debt.totalDebt + newDebt}
                  tone={player.debt.totalDebt + newDebt > 0 ? "red" : "neutral"}
                />
              </SummaryRow>
            </div>

            {needApproval && <ManagerApprovalFields value={approval} onChange={setApproval} />}

            {error && (
              <p role="alert" className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" onClick={() => setStep("form")} disabled={saving}>
                חזרה לעריכה
              </Button>
              <Button size="lg" onClick={submit} loading={saving} data-testid="buyin-confirm">
                אישור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
