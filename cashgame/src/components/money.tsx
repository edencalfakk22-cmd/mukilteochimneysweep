"use client";

import * as React from "react";
import { formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Displays an agorot amount as ILS with correct LTR number isolation. */
export function MoneyDisplay({
  amount,
  withSign,
  tone,
  className,
}: {
  amount: number;
  withSign?: boolean;
  tone?: "auto" | "green" | "red" | "blue" | "neutral";
  className?: string;
}) {
  const resolved =
    tone === "auto" ? (amount > 0 ? "green" : amount < 0 ? "red" : "neutral") : (tone ?? "neutral");
  const toneClass = {
    green: "text-money-in",
    red: "text-debt",
    blue: "text-chips",
    neutral: "",
  }[resolved];
  return (
    <span className={cn("num font-semibold", toneClass, className)}>
      {formatILS(amount, { withSign })}
    </span>
  );
}

/**
 * Money input working in WHOLE SHEKELS in the UI, reporting integer agorot.
 * Formats with thousands separators while typing without corrupting the value.
 * Opens the numeric keyboard on mobile.
 */
export function MoneyInput({
  id,
  label,
  valueAgorot,
  onChangeAgorot,
  autoFocus,
  error,
  disabled,
  placeholder,
}: {
  id: string;
  label?: string;
  valueAgorot: number | null;
  onChangeAgorot: (agorot: number | null) => void;
  autoFocus?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = React.useState(valueAgorot != null ? format(valueAgorot) : "");
  const [lastValue, setLastValue] = React.useState(valueAgorot);

  // Sync display when the value changes from outside (quick buttons) —
  // render-time state adjustment, per React's derived-state guidance.
  if (valueAgorot !== lastValue) {
    setLastValue(valueAgorot);
    if (parse(text) !== valueAgorot) {
      setText(valueAgorot != null ? format(valueAgorot) : "");
    }
  }

  function format(agorot: number): string {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(agorot / 100));
  }
  function parse(s: string): number | null {
    const digits = s.replace(/[^\d]/g, "");
    if (!digits) return null;
    const shekels = Number(digits);
    if (!Number.isSafeInteger(shekels * 100)) return null;
    return shekels * 100;
  }

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          pattern="[0-9,]*"
          dir="ltr"
          className="pe-8 text-start text-lg font-semibold"
          value={text}
          placeholder={placeholder ?? "0"}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => {
            const next = parse(e.target.value);
            setText(next != null ? format(next) : "");
            onChangeAgorot(next);
          }}
          aria-invalid={!!error}
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted">₪</span>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** One-tap quick amount buttons (configured in settings). */
export function QuickAmountButtons({
  amounts,
  onPick,
  selected,
}: {
  amounts: number[];
  onPick: (agorot: number) => void;
  selected?: number | null;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="סכומים מהירים">
      {amounts.map((a) => (
        <Button
          key={a}
          type="button"
          variant={selected === a ? "primary" : "secondary"}
          size="default"
          className="min-w-20 flex-1"
          onClick={() => onPick(a)}
        >
          <MoneyDisplay amount={a} className={selected === a ? "text-white" : ""} />
        </Button>
      ))}
    </div>
  );
}
