/** Hebrew labels for all enums and domain terms. Single source of truth for UI text. */

import type {
  PaymentMethod,
  Role,
  SessionStatus,
  SessionPlayerStatus,
  TransactionType,
  CountType,
} from "@prisma/client";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "מזומן",
  BIT: "ביט",
  BANK_TRANSFER: "העברה בנקאית",
  CREDIT_CARD: "אשראי",
  OTHER: "אחר",
  UNPAID: "לא שולם",
};

export const roleLabels: Record<Role, string> = {
  OWNER: "בעלים",
  MANAGER: "מנהל",
  OPERATOR: "מפעיל",
  VIEWER: "צפייה בלבד",
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  DRAFT: "טיוטה",
  OPEN: "פתוח",
  CLOSING: "בסגירה",
  CLOSED: "סגור",
  REOPENED: "נפתח מחדש",
};

export const sessionPlayerStatusLabels: Record<SessionPlayerStatus, string> = {
  ACTIVE: "פעיל",
  LEFT: "עזב",
  SETTLED: "סגור",
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  SESSION_BUY_IN: "קניית צ׳יפים",
  SESSION_REBUY: "קנייה חוזרת",
  PAYMENT_RECEIVED: "תשלום התקבל",
  CHIPS_RETURNED: "החזרת צ׳יפים",
  CASH_PAID_TO_PLAYER: "תשלום לשחקן",
  DEBT_CREATED: "יצירת חוב",
  DEBT_PAYMENT: "פירעון חוב",
  CASHOUT_APPLIED_TO_DEBT: "קיזוז פדיון מחוב",
  PLAYER_CREDIT_CREATED: "יצירת יתרת זכות",
  PLAYER_CREDIT_USED: "שימוש ביתרת זכות",
  CASH_DRAWER_DEPOSIT: "הפקדה לקופה",
  CASH_DRAWER_WITHDRAWAL: "משיכה מהקופה",
  EXPENSE: "הוצאה",
  ADJUSTMENT: "התאמה ידנית",
  REVERSAL: "ביטול פעולה",
};

export const countTypeLabels: Record<CountType, string> = {
  OPENING: "ספירת פתיחה",
  INTERIM: "ספירת ביניים",
  CLOSING: "ספירת סגירה",
};

/** Payment methods selectable when money actually moves (excludes UNPAID). */
export const payableMethods: PaymentMethod[] = ["CASH", "BIT", "BANK_TRANSFER", "CREDIT_CARD", "OTHER"];
