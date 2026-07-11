"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Banknote, FileDown, Pencil, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { newIdempotencyKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MoneyDisplay, MoneyInput } from "@/components/money";
import { DebtBadge, PaymentMethodBadge } from "@/components/domain-badges";
import { ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { SummaryRow } from "@/components/session/approval";
import { transactionTypeLabels, paymentMethodLabels, payableMethods, sessionStatusLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { PaymentMethod, TransactionStatus, TransactionType, SessionStatus, SessionPlayerStatus } from "@prisma/client";

interface ProfileDto {
  player: {
    id: string;
    fullName: string;
    phone: string | null;
    nickname: string | null;
    notes: string | null;
    isActive: boolean;
    creditLimit: number | null;
    currentDebt: number;
    currentCredit: number;
    createdAt: string;
  };
  totals: {
    chipsIssuedTotal: number;
    paymentsTotal: number;
    chipsReturnedTotal: number;
    gameResultTotal: number;
    sessionsCount: number;
  };
  sessions: {
    sessionId: string;
    name: string;
    startedAt: string;
    sessionStatus: SessionStatus;
    playerStatus: SessionPlayerStatus;
    stats: { playerPosition: number; chipsIssued: number; sessionDebtOutstanding: number };
  }[];
  transactions: {
    id: string;
    type: TransactionType;
    amount: number;
    paymentMethod: PaymentMethod | null;
    status: TransactionStatus;
    createdAt: string;
    createdByName: string | null;
    sessionId: string | null;
    sessionName: string | null;
    notes: string | null;
  }[];
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, refresh } = useApi<ProfileDto>(id ? `/api/players/${id}` : null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [adjOpen, setAdjOpen] = React.useState(false);
  // Changing key remounts dialogs so every open starts with fresh form state.
  const [nonce, setNonce] = React.useState(0);
  const openDialog = (setter: (o: boolean) => void) => {
    setNonce((n) => n + 1);
    setter(true);
  };

  if (loading && !data) return <LoadingSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!data) return null;

  const p = data.player;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {p.fullName}
            {p.nickname && <span className="ms-2 text-lg font-normal text-muted">({p.nickname})</span>}
            {!p.isActive && <span className="ms-2 text-sm text-muted">(לא פעיל)</span>}
          </h1>
          {p.phone && (
            <p className="num text-sm text-muted" dir="ltr">
              {p.phone}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DebtBadge amount={p.currentDebt} />
            {p.currentCredit > 0 && (
              <span className="text-sm text-money-in">
                יתרת זכות: <MoneyDisplay amount={p.currentCredit} tone="green" />
              </span>
            )}
            {p.creditLimit != null && (
              <span className="text-sm text-muted">
                מסגרת אשראי: <MoneyDisplay amount={p.creditLimit} />
                {p.currentDebt > p.creditLimit && (
                  <span className="ms-1 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">חריגה!</span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openDialog(setPayOpen)} variant="success" data-testid="record-debt-payment">
            <Banknote className="h-5 w-5" aria-hidden />
            רישום תשלום חוב
          </Button>
          <Button variant="secondary" onClick={() => openDialog(setAdjOpen)}>
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
            התאמה ידנית
          </Button>
          <Button variant="secondary" onClick={() => openDialog(setEditOpen)}>
            <Pencil className="h-5 w-5" aria-hidden />
            עריכה
          </Button>
          <a href={`/api/players/${p.id}/statement?format=pdf`} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <FileDown className="h-5 w-5" aria-hidden />
              דוח PDF
            </Button>
          </a>
          <a href={`/api/players/${p.id}/statement?format=xlsx`}>
            <Button variant="secondary">
              <FileDown className="h-5 w-5" aria-hidden />
              Excel
            </Button>
          </a>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "סשנים", value: <span className="num font-semibold">{data.totals.sessionsCount}</span> },
          { label: "צ׳יפים (מצטבר)", value: <MoneyDisplay amount={data.totals.chipsIssuedTotal} tone="blue" /> },
          { label: "תשלומים (מצטבר)", value: <MoneyDisplay amount={data.totals.paymentsTotal} tone="green" /> },
          { label: "פדיונות (מצטבר)", value: <MoneyDisplay amount={data.totals.chipsReturnedTotal} /> },
          { label: "מאזן משחק כולל", value: <MoneyDisplay amount={data.totals.gameResultTotal} tone="auto" withSign /> },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted">{c.label}</p>
              <p className="mt-1 text-lg">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Session history */}
        <Card>
          <CardHeader>
            <CardTitle>היסטוריית סשנים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sessions.map((s) => (
              <Link
                key={s.sessionId}
                href={`/sessions/${s.sessionId}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-surface-muted"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(s.startedAt)} · {sessionStatusLabels[s.sessionStatus]}
                  </p>
                </div>
                <div className="text-end">
                  <MoneyDisplay amount={s.stats.playerPosition} tone="auto" withSign />
                  {s.stats.sessionDebtOutstanding > 0 && (
                    <p className="text-xs text-debt">
                      חוב פתוח: <MoneyDisplay amount={s.stats.sessionDebtOutstanding} tone="red" className="text-xs" />
                    </p>
                  )}
                </div>
              </Link>
            ))}
            {data.sessions.length === 0 && <p className="p-3 text-center text-muted">אין סשנים</p>}
          </CardContent>
        </Card>

        {/* Transaction history */}
        <Card>
          <CardHeader>
            <CardTitle>היסטוריית פעולות</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="max-h-96 space-y-2 overflow-y-auto">
              {data.transactions.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm ${
                    t.status === "REVERSED" ? "opacity-60" : ""
                  }`}
                >
                  <div>
                    <p className="font-medium">
                      {transactionTypeLabels[t.type]}
                      {t.status === "REVERSED" && <span className="ms-1 text-xs text-debt">(בוטלה)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(t.createdAt)}
                      {t.sessionName && ` · ${t.sessionName}`}
                      {t.createdByName && ` · ${t.createdByName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentMethodBadge method={t.paymentMethod} />
                    <MoneyDisplay amount={t.amount} className={t.status === "REVERSED" ? "line-through" : ""} />
                  </div>
                </li>
              ))}
              {data.transactions.length === 0 && <p className="p-3 text-center text-muted">אין פעולות</p>}
            </ol>
          </CardContent>
        </Card>
      </div>

      <ProfileDebtPaymentDialog key={`pay-${nonce}`} player={p} open={payOpen} onOpenChange={setPayOpen} onDone={refresh} />
      <EditPlayerDialog key={`edit-${nonce}`} player={p} open={editOpen} onOpenChange={setEditOpen} onDone={refresh} />
      <AdjustmentDialog key={`adj-${nonce}`} player={p} open={adjOpen} onOpenChange={setAdjOpen} onDone={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProfileDebtPaymentDialog({
  player,
  open,
  onOpenChange,
  onDone,
}: {
  player: ProfileDto["player"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [notes, setNotes] = React.useState("");
  const [allowCredit, setAllowCredit] = React.useState(false);
  const [excess, setExcess] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.

  async function submit() {
    if (!amount || amount <= 0) {
      setError("יש להזין סכום");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/players/${player.id}/payment`, {
        method: "POST",
        body: {
          idempotencyKey: idemKey.current,
          amount,
          paymentMethod: method,
          allowCreditCreation: allowCredit || undefined,
          notes: notes || undefined,
        },
      });
      toast.success("התשלום נרשם");
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        const d = e.details as { kind?: string; excess?: number } | null;
        if (d?.kind === "CREATE_CREDIT") {
          setExcess(d.excess ?? 0);
        } else setError(e.message);
      } else {
        setError(e instanceof ApiError ? e.message : "אירעה שגיאה");
      }
    } finally {
      setSaving(false);
    }
  }

  const after = Math.max(0, player.currentDebt - (amount ?? 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title={`תשלום חוב — ${player.fullName}`}>
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-muted p-3">
            <SummaryRow label="חוב נוכחי">
              <MoneyDisplay amount={player.currentDebt} tone={player.currentDebt > 0 ? "red" : "neutral"} />
            </SummaryRow>
          </div>
          <MoneyInput id="pd-amount" label="סכום" valueAgorot={amount} onChangeAgorot={setAmount} autoFocus />
          <div>
            <Label htmlFor="pd-method">אמצעי תשלום</Label>
            <Select id="pd-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {payableMethods.map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pd-notes">הערות</Label>
            <Input id="pd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {amount != null && amount > 0 && (
            <div className="rounded-lg bg-surface-muted p-3">
              <SummaryRow label="חוב לפני">
                <MoneyDisplay amount={player.currentDebt} tone="red" />
              </SummaryRow>
              <SummaryRow label="חוב אחרי" strong>
                <MoneyDisplay amount={after} tone={after > 0 ? "red" : "green"} />
              </SummaryRow>
            </div>
          )}
          {excess != null && (
            <label className="flex items-center gap-2 rounded-lg border border-warn bg-warn-bg p-3 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={allowCredit} onChange={(e) => setAllowCredit(e.target.checked)} />
              התשלום גבוה מהחוב — צור יתרת זכות בסך <MoneyDisplay amount={excess} />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={submit} loading={saving} data-testid="profile-payment-confirm">
            רישום תשלום
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPlayerDialog({
  player,
  open,
  onOpenChange,
  onDone,
}: {
  player: ProfileDto["player"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = React.useState(player.fullName);
  const [nickname, setNickname] = React.useState(player.nickname ?? "");
  const [phone, setPhone] = React.useState(player.phone ?? "");
  const [notes, setNotes] = React.useState(player.notes ?? "");
  const [creditLimit, setCreditLimit] = React.useState<number | null>(player.creditLimit);
  const [isActive, setIsActive] = React.useState(player.isActive);
  const [saving, setSaving] = React.useState(false);

  // Initial values come from props at mount; the parent remounts per open.

  async function submit() {
    setSaving(true);
    try {
      await api(`/api/players/${player.id}`, {
        method: "PATCH",
        body: {
          fullName,
          nickname: nickname || null,
          phone: phone || null,
          notes: notes || null,
          creditLimit,
          isActive,
        },
      });
      toast.success("פרטי השחקן עודכנו");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title={`עריכת שחקן — ${player.fullName}`}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="ep-name">שם מלא</Label>
            <Input id="ep-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ep-nick">כינוי</Label>
              <Input id="ep-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ep-phone">טלפון</Label>
              <Input id="ep-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <MoneyInput id="ep-limit" label="מסגרת אשראי (ריק = ללא)" valueAgorot={creditLimit} onChangeAgorot={setCreditLimit} />
          <div>
            <Label htmlFor="ep-notes">הערות</Label>
            <Textarea id="ep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            שחקן פעיל
          </label>
          <Button size="lg" className="w-full" onClick={submit} loading={saving}>
            שמירה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentDialog({
  player,
  open,
  onOpenChange,
  onDone,
}: {
  player: ProfileDto["player"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [target, setTarget] = React.useState<"DEBT" | "CREDIT">("DEBT");
  const [sign, setSign] = React.useState<1 | -1>(-1);
  const [amount, setAmount] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemKey = React.useRef(newIdempotencyKey());

  // Fresh state per open: the parent remounts this dialog with a changing key.

  async function submit() {
    if (!amount || amount <= 0) {
      setError("יש להזין סכום");
      return;
    }
    if (reason.trim().length < 3) {
      setError("חובה לציין סיבה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/players/${player.id}/adjustment`, {
        method: "POST",
        body: { idempotencyKey: idemKey.current, target, sign, amount, reason: reason.trim() },
      });
      toast.success("ההתאמה נרשמה");
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title="התאמה ידנית" description="לשימוש מנהלים בלבד — מתועד ביומן הביקורת">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="adj-target">יעד</Label>
              <Select id="adj-target" value={target} onChange={(e) => setTarget(e.target.value as "DEBT" | "CREDIT")}>
                <option value="DEBT">חוב</option>
                <option value="CREDIT">יתרת זכות</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="adj-sign">כיוון</Label>
              <Select id="adj-sign" value={String(sign)} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)}>
                <option value="-1">הפחתה</option>
                <option value="1">הוספה</option>
              </Select>
            </div>
          </div>
          <MoneyInput id="adj-amount" label="סכום" valueAgorot={amount} onChangeAgorot={setAmount} />
          <div>
            <Label htmlFor="adj-reason">סיבה (חובה)</Label>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={submit} loading={saving}>
            רישום התאמה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
