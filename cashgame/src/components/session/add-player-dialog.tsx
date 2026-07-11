"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput, QuickAmountButtons } from "@/components/money";
import { DebtBadge } from "@/components/domain-badges";
import { SummaryRow } from "@/components/session/approval";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { paymentMethodLabels, payableMethods } from "@/lib/labels";
import type { SessionPlayerDto, SessionSettingsDto } from "@/components/session/types";
import type { PaymentMethod } from "@prisma/client";

interface PlayerSearchRow {
  id: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  currentDebt: number;
  currentCredit: number;
}

type PayMode = "FULL" | "PARTIAL" | "NONE";

export function AddPlayerDialog({
  sessionId,
  existingPlayers,
  settings,
  open,
  onOpenChange,
  onDone,
}: {
  sessionId: string;
  existingPlayers: SessionPlayerDto[];
  settings: SessionSettingsDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<PlayerSearchRow[]>([]);
  const [selected, setSelected] = React.useState<PlayerSearchRow | null>(null);
  const [createMode, setCreateMode] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newNickname, setNewNickname] = React.useState("");

  const [withBuyIn, setWithBuyIn] = React.useState(true);
  const [chipAmount, setChipAmount] = React.useState<number | null>(null);
  const [payMode, setPayMode] = React.useState<PayMode>("FULL");
  const [paidNow, setPaidNow] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");

  const [step, setStep] = React.useState<"pick" | "confirm">("pick");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needHighConfirm, setNeedHighConfirm] = React.useState(false);
  const [needOverLimitConfirm, setNeedOverLimitConfirm] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  const inSessionIds = React.useMemo(
    () => new Set(existingPlayers.map((p) => p.playerId)),
    [existingPlayers],
  );

  // Fresh state per open: the parent remounts this dialog with a changing key.
  useUnsavedGuard(open && (chipAmount != null || createMode) && !saving);

  // Instant search with a short debounce.
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ players: PlayerSearchRow[] }>(
          `/api/players?q=${encodeURIComponent(query)}&activeOnly=1`,
        );
        setResults(res.players);
      } catch {
        /* search errors are non-fatal */
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  const effectivePaid = !withBuyIn
    ? 0
    : payMode === "FULL"
      ? (chipAmount ?? 0)
      : payMode === "NONE"
        ? 0
        : (paidNow ?? 0);
  const newDebt = withBuyIn ? Math.max(0, (chipAmount ?? 0) - effectivePaid) : 0;
  const priorDebt = selected?.currentDebt ?? 0;
  const displayName = createMode ? newName : (selected?.fullName ?? "");

  function toConfirm() {
    setError(null);
    if (createMode && newName.trim().length < 2) {
      setError("יש להזין שם שחקן");
      return;
    }
    if (!createMode && !selected) {
      setError("יש לבחור שחקן או ליצור חדש");
      return;
    }
    if (withBuyIn) {
      if (!chipAmount || chipAmount <= 0) {
        setError("יש להזין סכום קנייה ראשונית (או בטל את הקנייה)");
        return;
      }
      if (effectivePaid > chipAmount) {
        setError("הסכום ששולם גבוה מסכום הקנייה");
        return;
      }
    }
    setStep("confirm");
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/sessions/${sessionId}/players`, {
        method: "POST",
        body: {
          idempotencyKey: idemKey.current,
          playerId: createMode ? undefined : selected!.id,
          newPlayer: createMode
            ? { fullName: newName.trim(), phone: newPhone || undefined, nickname: newNickname || undefined }
            : undefined,
          initialBuyIn:
            withBuyIn && chipAmount
              ? {
                  chipAmount,
                  paidNow: effectivePaid,
                  paymentMethod: effectivePaid > 0 ? (method as Exclude<PaymentMethod, "UNPAID">) : undefined,
                  confirmHighAmount: needHighConfirm || undefined,
                  confirmOverLimit: needOverLimitConfirm || undefined,
                }
              : undefined,
        },
      });
      toast.success(`${displayName} נוסף לסשן`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        const kind = (e.details as { kind?: string } | null)?.kind;
        if (kind === "HIGH_AMOUNT") setNeedHighConfirm(true);
        if (kind === "OVER_CREDIT_LIMIT") setNeedOverLimitConfirm(true);
        setError(`${e.message} — לחץ אישור שוב כדי להמשיך`);
      } else if (e instanceof ApiError && e.code === "CONFLICT") {
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
      <DialogContent title="הוספת שחקן לסשן" onInteractOutside={(e) => e.preventDefault()}>
        {step === "pick" ? (
          <div className="space-y-4">
            {!createMode ? (
              <>
                <div className="relative">
                  <Search className="absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
                  <Input
                    placeholder="חיפוש לפי שם, כינוי או טלפון..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    aria-label="חיפוש שחקן"
                    data-testid="player-search"
                  />
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="תוצאות חיפוש">
                  {results.map((p) => {
                    const already = inSessionIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => setSelected(p)}
                          data-testid={`pick-player-${p.fullName}`}
                          className={`flex w-full items-center justify-between rounded-lg border p-3 text-start ${
                            selected?.id === p.id
                              ? "border-chips bg-chips-bg"
                              : "border-border hover:bg-surface-muted"
                          } ${already ? "opacity-50" : ""}`}
                        >
                          <span>
                            <span className="font-medium">{p.fullName}</span>
                            {p.nickname && <span className="ms-1 text-xs text-muted">({p.nickname})</span>}
                            {already && <span className="ms-2 text-xs text-warn">כבר בסשן</span>}
                          </span>
                          <DebtBadge amount={p.currentDebt} />
                        </button>
                      </li>
                    );
                  })}
                  {results.length === 0 && (
                    <li className="p-3 text-center text-sm text-muted">לא נמצאו שחקנים</li>
                  )}
                </ul>
                <Button variant="outline" className="w-full" onClick={() => setCreateMode(true)} data-testid="create-new-player">
                  <UserPlus className="h-5 w-5" aria-hidden />
                  יצירת שחקן חדש
                </Button>
              </>
            ) : (
              <fieldset className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium">שחקן חדש</legend>
                <div>
                  <Label htmlFor="np-name">שם מלא</Label>
                  <Input id="np-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus data-testid="new-player-name" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="np-nick">כינוי</Label>
                    <Input id="np-nick" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="np-phone">טלפון</Label>
                    <Input id="np-phone" dir="ltr" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCreateMode(false)}>
                  חזרה לחיפוש
                </Button>
              </fieldset>
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={withBuyIn}
                onChange={(e) => setWithBuyIn(e.target.checked)}
              />
              קנייה ראשונית עכשיו
            </label>

            {withBuyIn && (
              <div className="space-y-3">
                <QuickAmountButtons amounts={settings.defaultBuyInButtons} selected={chipAmount} onPick={setChipAmount} />
                <MoneyInput id="ap-chips" label="סכום צ׳יפים" valueAgorot={chipAmount} onChangeAgorot={setChipAmount} />
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
                      data-testid={`ap-paymode-${mode}`}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {payMode === "PARTIAL" && (
                  <MoneyInput id="ap-paid" label="סכום ששולם עכשיו" valueAgorot={paidNow} onChangeAgorot={setPaidNow} />
                )}
                {payMode !== "NONE" && (
                  <div>
                    <Label htmlFor="ap-method">אמצעי תשלום</Label>
                    <Select id="ap-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                      {payableMethods.map((m) => (
                        <option key={m} value={m}>
                          {paymentMethodLabels[m]}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
                {error}
              </p>
            )}

            <Button size="lg" className="w-full" onClick={toConfirm} data-testid="add-player-continue">
              המשך לאישור
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-muted p-3" data-testid="add-player-summary">
              <p className="mb-2 text-lg font-bold">{displayName}</p>
              {withBuyIn && chipAmount ? (
                <>
                  <SummaryRow label="צ׳יפים">
                    <MoneyDisplay amount={chipAmount} tone="blue" />
                  </SummaryRow>
                  <SummaryRow label={`שולם ${effectivePaid > 0 ? `ב${paymentMethodLabels[method]}` : ""}`}>
                    <MoneyDisplay amount={effectivePaid} tone="green" />
                  </SummaryRow>
                  <SummaryRow label="חוב חדש">
                    <MoneyDisplay amount={newDebt} tone={newDebt > 0 ? "red" : "neutral"} />
                  </SummaryRow>
                </>
              ) : (
                <p className="text-sm text-muted">ללא קנייה ראשונית</p>
              )}
              <SummaryRow label="חוב קודם">
                <MoneyDisplay amount={priorDebt} tone={priorDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="חוב כולל לאחר הפעולה" strong>
                <MoneyDisplay amount={priorDebt + newDebt} tone={priorDebt + newDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" onClick={() => setStep("pick")} disabled={saving}>
                חזרה לעריכה
              </Button>
              <Button size="lg" onClick={submit} loading={saving} data-testid="add-player-confirm">
                אישור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
