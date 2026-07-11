"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Input, Label } from "@/components/ui/input";

export interface ApprovalValue {
  username: string;
  secret: string;
}

/**
 * Inline manager-approval fields, shown when the server demands a manager
 * sign-off (APPROVAL_REQUIRED). The manager types their username + PIN/password;
 * verification happens on the server only.
 */
export function ManagerApprovalFields({
  value,
  onChange,
}: {
  value: ApprovalValue;
  onChange: (v: ApprovalValue) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-warn bg-warn-bg p-3">
      <legend className="flex items-center gap-1 px-1 text-sm font-semibold text-warn">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        נדרש אישור מנהל
      </legend>
      <div>
        <Label htmlFor="approval-username">שם משתמש של מנהל</Label>
        <Input
          id="approval-username"
          dir="ltr"
          autoComplete="off"
          value={value.username}
          onChange={(e) => onChange({ ...value, username: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="approval-secret">קוד PIN או סיסמה של המנהל</Label>
        <Input
          id="approval-secret"
          type="password"
          dir="ltr"
          autoComplete="off"
          value={value.secret}
          onChange={(e) => onChange({ ...value, secret: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

/** Rows of a before/after confirmation summary. */
export function SummaryRow({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 ${strong ? "font-bold" : ""}`}>
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
