"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { MoneyDisplay, MoneyInput } from "@/components/money";
import { PlayerStatusBadge } from "@/components/domain-badges";
import { ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { SummaryRow } from "@/components/session/approval";
import { isWritableStatus, type SessionStateDto } from "@/components/session/types";

const STEPS = ["שחקנים", "חובות", "קופה", "אמצעי תשלום", "סיכום", "סגירה"] as const;

export default function CloseSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: state, error, loading, refresh } = useApi<SessionStateDto>(id ? `/api/sessions/${id}` : null);

  const [step, setStep] = React.useState(0);
  const [countedCash, setCountedCash] = React.useState<number | null>(null);
  const [explanation, setExplanation] = React.useState("");
  const [credential, setCredential] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  if (loading && !state) return <LoadingSkeleton rows={4} />;
  if (error && !state) return <ErrorState message={error} onRetry={() => refresh(false)} />;
  if (!state) return null;

  if (!isWritableStatus(state.session.status)) {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-money-in" aria-hidden />
        <h1 className="text-2xl font-bold">הסשן סגור</h1>
        <Link href={`/sessions/${state.session.id}/report`}>
          <Button size="lg">צפייה בדוח הסגירה</Button>
        </Link>
      </div>
    );
  }

  const activePlayers = state.players.filter((p) => p.status === "ACTIVE");
  const debtors = state.players.filter((p) => p.stats.sessionDebtOutstanding > 0);
  const expected = state.expectedCash;
  const difference = countedCash != null ? countedCash - expected : null;

  async function submitClose() {
    if (countedCash == null) {
      setServerError("יש להזין את סכום המזומן שנספר");
      setStep(2);
      return;
    }
    if (!credential) {
      setServerError("נדרש אימות סיסמה או PIN לסגירה");
      return;
    }
    setClosing(true);
    setServerError(null);
    try {
      await api(`/api/sessions/${state!.session.id}/close`, {
        method: "POST",
        body: {
          countedClosingCashAmount: countedCash,
          differenceExplanation: explanation || undefined,
          credential,
          notes: notes || undefined,
          expectedVersion: state!.session.version,
        },
      });
      toast.success("הסשן נסגר בהצלחה");
      router.replace(`/sessions/${state!.session.id}/report`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        const kind = (e.details as { kind?: string } | null)?.kind;
        if (kind === "ACTIVE_PLAYERS") {
          setServerError("יש שחקנים פעילים שטרם יצאו — חזור לסשן והוצא אותם");
          setStep(0);
        } else if (kind === "CASH_DIFFERENCE") {
          setServerError("קיים הפרש בקופה — חובה לציין הסבר");
          setStep(2);
        } else {
          setServerError(e.message);
        }
      } else {
        setServerError(e instanceof ApiError ? e.message : "אירעה שגיאה — נסה שוב");
      }
      setClosing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">סגירת סשן — {state.session.name}</h1>

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="שלבי סגירה">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${
              i === step ? "bg-primary text-white" : i < step ? "bg-money-in-bg text-money-in" : "bg-surface-muted text-muted"
            }`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              {activePlayers.length > 0 ? (
                <div className="rounded-lg border border-warn bg-warn-bg p-3">
                  <p className="mb-2 font-medium text-warn" data-testid="unsettled-warning">
                    {activePlayers.length} שחקנים פעילים חייבים לצאת מהסשן לפני הסגירה:
                  </p>
                  <ul className="space-y-1">
                    {activePlayers.map((p) => (
                      <li key={p.playerId} className="flex items-center justify-between rounded-lg bg-surface p-2">
                        <span>{p.fullName}</span>
                        <Link href={`/sessions/${state.session.id}`}>
                          <Button size="sm" variant="secondary">
                            לטיפול בסשן
                          </Button>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-money-in">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  כל השחקנים יצאו מהסשן
                </p>
              )}
              <ul className="space-y-1">
                {state.players.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                    <span>{p.fullName}</span>
                    <span className="flex items-center gap-2">
                      <PlayerStatusBadge status={p.status} />
                      <MoneyDisplay amount={p.stats.playerPosition} tone="auto" withSign />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 1 && (
            <>
              {debtors.length === 0 ? (
                <p className="flex items-center gap-2 text-money-in">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  אין חובות פתוחים מהסשן הזה
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    החובות הבאים יישארו פתוחים ויעברו למעקב במסך החובות:
                  </p>
                  <ul className="space-y-1">
                    {debtors.map((p) => (
                      <li key={p.playerId} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="font-medium">{p.fullName}</span>
                        <MoneyDisplay amount={p.stats.sessionDebtOutstanding} tone="red" />
                      </li>
                    ))}
                  </ul>
                  <SummaryRow label="סה״כ חוב פתוח מהסשן" strong>
                    <MoneyDisplay amount={state.openSessionDebt} tone="red" />
                  </SummaryRow>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <SummaryRow label="מזומן צפוי בקופה" strong>
                <span data-testid="close-expected-cash">
                  <MoneyDisplay amount={expected} />
                </span>
              </SummaryRow>
              <MoneyInput
                id="counted-cash"
                label="מזומן שנספר בפועל"
                valueAgorot={countedCash}
                onChangeAgorot={setCountedCash}
                autoFocus
              />
              {difference != null && (
                <p
                  className={`rounded-lg p-3 font-medium ${difference === 0 ? "bg-money-in-bg text-money-in" : "bg-debt-bg text-debt"}`}
                  data-testid="close-difference"
                >
                  {difference === 0 ? (
                    "אין הפרש — הקופה מאוזנת ✓"
                  ) : (
                    <>
                      הפרש: <MoneyDisplay amount={difference} tone="red" withSign />
                    </>
                  )}
                </p>
              )}
              {difference != null && difference !== 0 && (
                <div>
                  <Label htmlFor="diff-explanation">הסבר להפרש (חובה)</Label>
                  <Textarea
                    id="diff-explanation"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    data-testid="difference-explanation"
                  />
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted">אישור סכומי תקבולים שאינם מזומן (לבדיקה מול האפליקציות):</p>
              <SummaryRow label="ביט">
                <MoneyDisplay amount={state.totals.paymentsIn.BIT} />
              </SummaryRow>
              <SummaryRow label="העברות בנקאיות">
                <MoneyDisplay amount={state.totals.paymentsIn.BANK_TRANSFER} />
              </SummaryRow>
              <SummaryRow label="אשראי">
                <MoneyDisplay amount={state.totals.paymentsIn.CREDIT_CARD} />
              </SummaryRow>
              <SummaryRow label="אחר">
                <MoneyDisplay amount={state.totals.paymentsIn.OTHER} />
              </SummaryRow>
              <SummaryRow label="לא שולם (חוב)">
                <MoneyDisplay amount={state.totals.debtCreated} tone="red" />
              </SummaryRow>
            </>
          )}

          {step === 4 && (
            <div data-testid="close-summary">
              <SummaryRow label="צ׳יפים שהונפקו">
                <MoneyDisplay amount={state.totals.chipsIssued} tone="blue" />
              </SummaryRow>
              <SummaryRow label="צ׳יפים שהוחזרו">
                <MoneyDisplay amount={state.totals.chipsReturned} />
              </SummaryRow>
              <SummaryRow label="תשלומים שהתקבלו">
                <MoneyDisplay amount={state.totals.paymentsInTotal} tone="green" />
              </SummaryRow>
              <SummaryRow label="שולם לשחקנים">
                <MoneyDisplay amount={state.totals.paidOutTotal} />
              </SummaryRow>
              <SummaryRow label="חוב פתוח">
                <MoneyDisplay amount={state.openSessionDebt} tone={state.openSessionDebt > 0 ? "red" : "neutral"} />
              </SummaryRow>
              <SummaryRow label="מזומן צפוי">
                <MoneyDisplay amount={expected} />
              </SummaryRow>
              <SummaryRow label="מזומן שנספר">
                {countedCash != null ? <MoneyDisplay amount={countedCash} /> : "—"}
              </SummaryRow>
              <SummaryRow label="הפרש" strong>
                {difference != null ? <MoneyDisplay amount={difference} tone={difference === 0 ? "green" : "red"} withSign /> : "—"}
              </SummaryRow>
              <SummaryRow label="נסגר על ידי">{state.viewer.name}</SummaryRow>
              <div className="mt-3">
                <Label htmlFor="close-notes">הערות סגירה (לא חובה)</Label>
                <Textarea id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          {step === 5 && (
            <>
              <p className="text-sm text-muted">
                לסגירה סופית נדרש אימות. הסשן יינעל וייווצר דוח סגירה קבוע.
              </p>
              <div>
                <Label htmlFor="close-credential">סיסמה או קוד PIN שלך</Label>
                <Input
                  id="close-credential"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  data-testid="close-credential"
                />
              </div>
            </>
          )}

          {serverError && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {serverError}
            </p>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {step > 0 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={closing}>
                <ChevronRight className="h-5 w-5" aria-hidden />
                הקודם
              </Button>
            ) : (
              <Link href={`/sessions/${state.session.id}`}>
                <Button variant="secondary">ביטול</Button>
              </Link>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (step === 0 && activePlayers.length > 0) ||
                  (step === 2 && countedCash == null) ||
                  (step === 2 && difference !== 0 && difference != null && explanation.trim().length < 2)
                }
                data-testid="close-next"
              >
                הבא
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
            ) : (
              <Button variant="danger" size="lg" onClick={submitClose} loading={closing} data-testid="close-final">
                סגירת הסשן
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
