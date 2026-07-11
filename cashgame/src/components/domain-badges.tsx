import * as React from "react";
import type { PaymentMethod, SessionStatus, SessionPlayerStatus } from "@prisma/client";
import {
  Banknote,
  Smartphone,
  Landmark,
  CreditCard,
  CircleHelp,
  CircleSlash,
  AlertCircle,
  CheckCircle2,
  DoorOpen,
  Lock,
  Unlock,
  FileEdit,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/money";
import { paymentMethodLabels, sessionStatusLabels, sessionPlayerStatusLabels } from "@/lib/labels";

const methodIcons: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-3.5 w-3.5" aria-hidden />,
  BIT: <Smartphone className="h-3.5 w-3.5" aria-hidden />,
  BANK_TRANSFER: <Landmark className="h-3.5 w-3.5" aria-hidden />,
  CREDIT_CARD: <CreditCard className="h-3.5 w-3.5" aria-hidden />,
  OTHER: <CircleHelp className="h-3.5 w-3.5" aria-hidden />,
  UNPAID: <CircleSlash className="h-3.5 w-3.5" aria-hidden />,
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return null;
  const tone = method === "CASH" ? "green" : method === "UNPAID" ? "red" : "blue";
  return (
    <Badge tone={tone}>
      {methodIcons[method]}
      {paymentMethodLabels[method]}
    </Badge>
  );
}

/** Debt badge: red + icon + explicit text, per the "not color alone" rule. */
export function DebtBadge({ amount }: { amount: number }) {
  if (amount <= 0) {
    return (
      <Badge tone="green">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ללא חוב
      </Badge>
    );
  }
  return (
    <Badge tone="red">
      <AlertCircle className="h-3.5 w-3.5" aria-hidden />
      חוב <MoneyDisplay amount={amount} tone="red" />
    </Badge>
  );
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { tone: "green" | "red" | "orange" | "blue" | "neutral"; icon: React.ReactNode }> = {
    DRAFT: { tone: "neutral", icon: <FileEdit className="h-3.5 w-3.5" aria-hidden /> },
    OPEN: { tone: "green", icon: <Unlock className="h-3.5 w-3.5" aria-hidden /> },
    CLOSING: { tone: "orange", icon: <DoorOpen className="h-3.5 w-3.5" aria-hidden /> },
    CLOSED: { tone: "neutral", icon: <Lock className="h-3.5 w-3.5" aria-hidden /> },
    REOPENED: { tone: "orange", icon: <Unlock className="h-3.5 w-3.5" aria-hidden /> },
  };
  const { tone, icon } = map[status];
  return (
    <Badge tone={tone}>
      {icon}
      {sessionStatusLabels[status]}
    </Badge>
  );
}

export function PlayerStatusBadge({ status }: { status: SessionPlayerStatus }) {
  const tone = status === "ACTIVE" ? "green" : status === "LEFT" ? "orange" : "neutral";
  return <Badge tone={tone}>{sessionPlayerStatusLabels[status]}</Badge>;
}
