"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput } from "@/components/money";
import { ManagerApprovalFields, SummaryRow, type ApprovalValue } from "@/components/session/approval";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { paymentMethodLabels } from "@/lib/labels";
import type { SessionPlayerDto, SessionSettingsDto } from "@/components/session/types";
import type { PaymentMethod } from "@prisma/client";

type Strategy = "DEBT_FIRST" | "PAY_FULL" | "MANUAL";

export function CashOutDialog({
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
  const [chipsReturned, setChipsReturned] = React.useState<number | null>(null);
  const [strategy, setStrategy] = React.useState<Strategy>(
    settings.defaultCashoutDebtBehavior === "PAY_FULL" ? "PAY_FULL" : "DEBT_FIRST",
  );
  // Manual split fields
  const [mSession, setMSession] = React.useState<number | null>(0);
  const [mHist, setMHist] = React.useState<number | null>(0);
  const [mCash, setMCash] = React.useState<number | null>(0);
  const [mNonCash, setMNonCash] = React.useState<number | null>(0);
  const [mNonCashMethod, setMNonCashMethod] = React.useState<PaymentMethod>("BIT");
  const [mCredit, setMCredit] = React.useState<number | null>(0);

  const [step, setStep] = React.useState<"form" | "confirm">("form");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needHighConfirm, setNeedHighConfirm] = React.useState(false);
  const [needApproval, setNeedApproval] = React.useState(false);
  const [approval, setApproval] = React.useState<ApprovalValue>({ username: "", secret: "" });
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.
  useUnsavedGuard(open && chipsReturned != null && !saving);

  if (!player) return null;

  const sessionDebt = player.debt.sessionDebt;
  const historicalDebt = Math.max(0, player.debt.historicalDebt);

  // Client-side preview mirroring the server's allocation logic.
  function previewAllocation(amount: number) {
    if (strategy === "PAY_FULL") {
      return { toSessionDebt: 0, toHistoricalDebt: 0, cashPaid: amount, nonCashPaid: 0, toCredit: 0 };
    }
    if (strategy === "MANUAL") {
      return {
        toSessionDebt: mSession ?? 0,
        toHistoricalDebt: mHist ?? 0,
        cashPaid: mCash ?? 0,
        nonCashPaid: mNonCash ?? 0,
        toCredit: mCredit ?? 0,
      };
    }
    const toSession = Math.min(amount, sessionDebt);
    let rest = amount - toSession;
    const toHist = settings.includeHistoricalDebtInCashout ? Math.min(rest, historicalDebt) : 0;
    rest -= toHist;
    return { toSessionDebt: toSession, toHistoricalDebt: toHist, cashPaid: rest, nonCashPaid: 0, toCredit: 0 };
  }

  const amount = chipsReturned ?? 0;
  const alloc = previewAllocation(amount);
  const allocSum = alloc.toSessionDebt + alloc.toHistoricalDebt + alloc.cashPaid + alloc.nonCashPaid + alloc.toCredit;
  const debtAfter = player.debt.totalDebt - alloc.toSessionDebt - alloc.toHistoricalDebt;
  const gameResultAfter = player.stats.playerPosition + amount;

  function toConfirm() {
    setError(null);
    if (!chipsReturned || chipsReturned <= 0) {
      setError("יש להזין את שווי הצ׳יפים המוחזרים");
      return;
    }
    if (strategy === "MANUAL" && allocSum !== chipsReturned) {
      setError("החלוקה חייבת להיות שווה בדיוק לשווי הצ׳יפים המוחזרים");
      return;
    }
    setStep("confirm");
  }

  async function submit() {
    if (!player || !chipsReturned) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/sessions/${sessionId}/cash-out`, {
        method: "POST",
        body: {
          idempotencyKey: idemKey.current,
          playerId: player.playerId,
          chipsReturned,
          strategy,
          manual:
            strategy === "MANUAL"
              ? {
                  toSessionDebt: mSession ?? 0,
                  toHistoricalDebt: mHist ?? 0,
                  cashPaid: mCash ?? 0,
                  nonCashPaid: mNonCash ?? 0,
                  nonCashMethod: (mNonCash ?? 0) > 0 ? mNonCashMethod : undefined,
                  toCredit: mCredit ?? 0,
                }
              : undefined,
          confirmHighAmount: needHighConfirm || undefined,
          approval: needApproval && approval.username ? approval : undefined,
        },
      });
      toast.success(
        <span>
          פדיון נרשם — {player.fullName}: <MoneyDisplay amount={chipsReturned} />
        </span>,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        setNeedHighConfirm(true);
        setError("הסכום גבוה מסף האזהרה — אשר שוב כדי להמשיך");
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
      <DialogContent title={`פדיון — ${player.fullName}`} onInteractOutside={(e) => e.preventDefault()}>
        {step === "form" ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-muted p-3 text-sm">
              <SummaryRow label="צ׳יפים שהונפקו בסשן">
                <MoneyDisplay amount={player.stats.chipsIssued} tone="blue" />
              </SummaryRow>
              <SummaryRow label="פדיונות קודמים">
                <MoneyDisplay amount={player.stats.chipsReturned} />
              </SummaryRow>
              <SummaryRow label="חוב בסשן הנוכחי">
                <MoneyDisplay amount={sessionDebt} tone={sessionDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="חוב קודם">
                <MoneyDisplay amount={historicalDebt} tone={historicalDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
            </div>

            <MoneyInput
              id="cashout-chips"
              label="שווי הצ׳יפים המוחזרים"
              valueAgorot={chipsReturned}
              onChangeAgorot={setChipsReturned}
              autoFocus
            />

            <div>
              <Label htmlFor="cashout-strategy">אופן ההתחשבנות</Label>
              <Select
                id="cashout-strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
              >
                <option value="DEBT_FIRST">קיזוז חוב קודם (מומלץ)</option>
                <option value="PAY_FULL">תשלום מלא לשחקן (החוב נשאר)</option>
                <option value="MANUAL">חלוקה ידנית</option>
              </Select>
            </div>

            {strategy === "MANUAL" && (
              <fieldset className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium">חלוקה ידנית</legend>
                <MoneyInput id="m-session" label={`קיזוז חוב סשן (עד ${sessionDebt / 100} ₪)`} valueAgorot={mSession} onChangeAgorot={setMSession} />
                <MoneyInput id="m-hist" label={`קיזוז חוב קודם (עד ${historicalDebt / 100} ₪)`} valueAgorot={mHist} onChangeAgorot={setMHist} />
                <MoneyInput id="m-cash" label="תשלום במזומן" valueAgorot={mCash} onChangeAgorot={setMCash} />
                <MoneyInput id="m-noncash" label="תשלום שלא במזומן" valueAgorot={mNonCash} onChangeAgorot={setMNonCash} />
                {(mNonCash ?? 0) > 0 && (
                  <Select value={mNonCashMethod} onChange={(e) => setMNonCashMethod(e.target.value as PaymentMethod)} aria-label="אמצעי תשלום שלא במזומן">
                    {(["BIT", "BANK_TRANSFER", "CREDIT_CARD", "OTHER"] as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {paymentMethodLabels[m]}
                      </option>
                    ))}
                  </Select>
                )}
                <MoneyInput id="m-credit" label="ליתרת זכות" valueAgorot={mCredit} onChangeAgorot={setMCredit} />
                <p className={`text-sm font-medium ${allocSum === amount ? "text-money-in" : "text-debt"}`}>
                  סה״כ חלוקה: <MoneyDisplay amount={allocSum} /> מתוך <MoneyDisplay amount={amount} />
                </p>
              </fieldset>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
                {error}
              </p>
            )}

            <Button size="lg" className="w-full" onClick={toConfirm} data-testid="cashout-continue">
              המשך לאישור
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-muted p-3" data-testid="cashout-summary">
              <SummaryRow label="צ׳יפים מוחזרים">
                <MoneyDisplay amount={amount} />
              </SummaryRow>
              <SummaryRow label="קיזוז חוב הסשן">
                <MoneyDisplay amount={alloc.toSessionDebt} />
              </SummaryRow>
              <SummaryRow label="קיזוז חוב קודם">
                <MoneyDisplay amount={alloc.toHistoricalDebt} />
              </SummaryRow>
              <SummaryRow label="תשלום במזומן לשחקן">
                <MoneyDisplay amount={alloc.cashPaid} tone={alloc.cashPaid > 0 ? "green" : "neutral"} />
              </SummaryRow>
              {alloc.nonCashPaid > 0 && (
                <SummaryRow label={`תשלום ${paymentMethodLabels[mNonCashMethod]}`}>
                  <MoneyDisplay amount={alloc.nonCashPaid} />
                </SummaryRow>
              )}
              {alloc.toCredit > 0 && (
                <SummaryRow label="ליתרת זכות">
                  <MoneyDisplay amount={alloc.toCredit} />
                </SummaryRow>
              )}
              <SummaryRow label="חוב שנותר" strong>
                <span data-testid="cashout-debt-after">
                  <MoneyDisplay amount={debtAfter} tone={debtAfter > 0 ? "red" : "neutral"} />
                </span>
              </SummaryRow>
              <SummaryRow label="תוצאת משחק לאחר הפדיון" strong>
                <MoneyDisplay amount={gameResultAfter} tone="auto" withSign />
              </SummaryRow>
            </div>

            {strategy === "PAY_FULL" && player.debt.totalDebt > 0 && (
              <p className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn">
                שים לב: השחקן יקבל את מלוא הסכום והחוב (
                <MoneyDisplay amount={player.debt.totalDebt} />) יישאר פתוח.
              </p>
            )}

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
              <Button size="lg" onClick={submit} loading={saving} data-testid="cashout-confirm">
                אישור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
