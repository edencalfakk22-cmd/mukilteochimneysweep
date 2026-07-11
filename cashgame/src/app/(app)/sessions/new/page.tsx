"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { MoneyInput } from "@/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, Textarea } from "@/components/ui/input";

/** Bill/coin denominations for the optional opening count (agorot each). */
const DENOMS: { key: string; label: string; value: number }[] = [
  { key: "200", label: "שטרות 200 ₪", value: 20000 },
  { key: "100", label: "שטרות 100 ₪", value: 10000 },
  { key: "50", label: "שטרות 50 ₪", value: 5000 },
  { key: "20", label: "שטרות 20 ₪", value: 2000 },
  { key: "10", label: "מטבעות 10 ₪", value: 1000 },
];

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = React.useState(() => {
    const d = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
    return `ערב משחק ${d}`;
  });
  const [openingCash, setOpeningCash] = React.useState<number | null>(null);
  const [useDenoms, setUseDenoms] = React.useState(false);
  const [denoms, setDenoms] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; cash?: string }>({});

  const denomTotal = DENOMS.reduce((acc, d) => acc + (denoms[d.key] ?? 0) * d.value, 0);
  const effectiveOpening = useDenoms ? denomTotal : (openingCash ?? 0);

  async function submit() {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "חובה לתת שם לסשן";
    if (effectiveOpening == null || effectiveOpening < 0) errs.cash = "יש להזין סכום פתיחה";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const res = await api<{ session: { id: string } }>("/api/sessions", {
        method: "POST",
        body: {
          name: name.trim(),
          openingCashAmount: effectiveOpening,
          denominations: useDenoms ? denoms : undefined,
          notes: notes || undefined,
        },
      });
      toast.success("הסשן נפתח בהצלחה");
      router.replace(`/sessions/${res.session.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "אירעה שגיאה");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">פתיחת סשן חדש</h1>
      <Card>
        <CardHeader>
          <CardTitle>פרטי הסשן</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="session-name">שם הסשן</Label>
            <Input id="session-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="session-name" />
            <FieldError>{errors.name}</FieldError>
          </div>

          {!useDenoms ? (
            <>
              <MoneyInput
                id="opening-cash"
                label="מזומן פתיחה בקופה"
                valueAgorot={openingCash}
                onChangeAgorot={setOpeningCash}
                error={errors.cash}
              />
              <Button variant="ghost" size="sm" onClick={() => setUseDenoms(true)}>
                ספירה לפי שטרות ומטבעות
              </Button>
            </>
          ) : (
            <fieldset className="space-y-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">ספירת קופה לפי שטרות</legend>
              {DENOMS.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`denom-${d.key}`} className="mb-0 flex-1">
                    {d.label}
                  </Label>
                  <Input
                    id={`denom-${d.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    dir="ltr"
                    className="w-24"
                    value={denoms[d.key] ?? ""}
                    onChange={(e) =>
                      setDenoms((prev) => ({ ...prev, [d.key]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                  />
                </div>
              ))}
              <p className="pt-2 text-end font-semibold">
                סה״כ: <span className="num">{(denomTotal / 100).toLocaleString("he-IL")} ₪</span>
              </p>
              <Button variant="ghost" size="sm" onClick={() => setUseDenoms(false)}>
                הזנת סכום ידנית
              </Button>
            </fieldset>
          )}

          <div>
            <Label htmlFor="session-notes">הערות (לא חובה)</Label>
            <Textarea id="session-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button size="lg" className="w-full" onClick={submit} loading={saving} data-testid="create-session">
            פתיחת הסשן
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
