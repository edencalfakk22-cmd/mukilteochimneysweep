/**
 * Application errors with stable codes and Hebrew user-facing messages.
 * API handlers convert these to JSON error responses; anything else becomes
 * a generic 500 without leaking internals.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "SESSION_NOT_OPEN"
  | "SESSION_ALREADY_CLOSED"
  | "DUPLICATE_REQUEST"
  | "CONFLICT"
  | "APPROVAL_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "INTEGRITY"
  | "INTERNAL";

const statusByCode: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  SESSION_NOT_OPEN: 409,
  SESSION_ALREADY_CLOSED: 409,
  DUPLICATE_REQUEST: 409,
  CONFLICT: 409,
  APPROVAL_REQUIRED: 403,
  CONFIRMATION_REQUIRED: 422,
  LIMIT_EXCEEDED: 422,
  RATE_LIMITED: 429,
  INTEGRITY: 500,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Hebrew message safe to show to the end user. */
  readonly userMessage: string;
  readonly details?: unknown;

  constructor(code: ErrorCode, userMessage: string, details?: unknown) {
    super(`${code}: ${userMessage}`);
    this.code = code;
    this.status = statusByCode[code];
    this.userMessage = userMessage;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", "נדרשת התחברות מחדש"),
  forbidden: (msg = "אין לך הרשאה לבצע פעולה זו") => new AppError("FORBIDDEN", msg),
  notFound: (msg = "הפריט המבוקש לא נמצא") => new AppError("NOT_FOUND", msg),
  validation: (msg: string, details?: unknown) => new AppError("VALIDATION", msg, details),
  sessionNotOpen: () => new AppError("SESSION_NOT_OPEN", "הסשן אינו פתוח — לא ניתן לרשום פעולות"),
  duplicate: () => new AppError("DUPLICATE_REQUEST", "הפעולה כבר נקלטה (בקשה כפולה)"),
  conflict: (msg = "הנתונים השתנו בינתיים — רענן ונסה שוב") => new AppError("CONFLICT", msg),
  approvalRequired: (msg = "נדרש אישור מנהל לפעולה זו") => new AppError("APPROVAL_REQUIRED", msg),
  confirmationRequired: (msg: string, details?: unknown) =>
    new AppError("CONFIRMATION_REQUIRED", msg, details),
  rateLimited: (retryAfterSec: number) =>
    new AppError("RATE_LIMITED", `יותר מדי ניסיונות — נסה שוב בעוד ${retryAfterSec} שניות`, {
      retryAfterSec,
    }),
  integrity: (msg: string) => new AppError("INTEGRITY", `שגיאת שלמות נתונים: ${msg}`),
} as const;
