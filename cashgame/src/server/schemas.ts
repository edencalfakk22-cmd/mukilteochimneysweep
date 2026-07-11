import { z } from "zod";

/** Integer agorot amount ≥ 0. UI converts shekels → agorot before sending. */
export const agorot = z.number().int("סכום חייב להיות מספר שלם באגורות").min(0, "סכום שלילי אינו חוקי");
export const agorotPositive = agorot.refine((v) => v > 0, "הסכום חייב להיות גדול מאפס");

export const paymentMethodSchema = z.enum(["CASH", "BIT", "BANK_TRANSFER", "CREDIT_CARD", "OTHER", "UNPAID"]);
export const payableMethodSchema = z.enum(["CASH", "BIT", "BANK_TRANSFER", "CREDIT_CARD", "OTHER"]);

export const idempotencyKeySchema = z.string().min(8, "חסר מזהה פעולה").max(128);

export const approvalSchema = z
  .object({ username: z.string().min(1), secret: z.string().min(1) })
  .optional();

export const loginSchema = z.object({
  username: z.string().min(1, "יש להזין שם משתמש"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export const unlockSchema = z.object({ pin: z.string().min(4).max(8) });

export const setPinSchema = z.object({
  currentPassword: z.string().min(1),
  pin: z.string().regex(/^\d{4,8}$/, "קוד PIN חייב להכיל 4–8 ספרות").nullable(),
});

export const playerCreateSchema = z.object({
  fullName: z.string().min(2, "שם קצר מדי").max(80),
  phone: z.string().max(20).optional().nullable(),
  nickname: z.string().max(40).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  creditLimit: agorot.optional().nullable(),
});

export const playerUpdateSchema = playerCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const openSessionSchema = z.object({
  name: z.string().min(1, "חובה לתת שם לסשן").max(120),
  openingCashAmount: agorot,
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  notes: z.string().max(2000).optional(),
});

export const addPlayerSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    playerId: z.string().optional(),
    newPlayer: z
      .object({
        fullName: z.string().min(2).max(80),
        phone: z.string().max(20).optional(),
        nickname: z.string().max(40).optional(),
        notes: z.string().max(2000).optional(),
      })
      .optional(),
    seatNumber: z.number().int().min(1).max(99).optional(),
    initialBuyIn: z
      .object({
        chipAmount: agorotPositive,
        paidNow: agorot,
        paymentMethod: payableMethodSchema.optional(),
        confirmHighAmount: z.boolean().optional(),
        confirmOverLimit: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((v) => v.playerId || v.newPlayer, { message: "יש לבחור שחקן קיים או ליצור חדש" });

export const buyInSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  playerId: z.string().min(1),
  chipAmount: agorotPositive,
  paidNow: agorot.default(0),
  paymentMethod: payableMethodSchema.optional(),
  useCredit: agorot.optional(),
  notes: z.string().max(2000).optional(),
  reference: z.string().max(120).optional(),
  paidByOther: z.string().max(120).optional(),
  confirmHighAmount: z.boolean().optional(),
  confirmOverLimit: z.boolean().optional(),
  approval: approvalSchema,
});

export const paymentSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  playerId: z.string().min(1),
  amount: agorotPositive,
  paymentMethod: payableMethodSchema,
  strategy: z.enum(["SESSION_FIRST", "OLDEST_FIRST", "HISTORICAL_ONLY", "MANUAL"]).optional(),
  manual: z.object({ toSessionDebt: agorot, toHistoricalDebt: agorot }).optional(),
  allowCreditCreation: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export const cashOutSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  playerId: z.string().min(1),
  chipsReturned: agorotPositive,
  strategy: z.enum(["DEBT_FIRST", "PAY_FULL", "MANUAL"]),
  manual: z
    .object({
      toSessionDebt: agorot,
      toHistoricalDebt: agorot,
      cashPaid: agorot,
      nonCashPaid: agorot,
      nonCashMethod: payableMethodSchema.optional(),
      toCredit: agorot,
    })
    .optional(),
  notes: z.string().max(2000).optional(),
  confirmHighAmount: z.boolean().optional(),
  approval: approvalSchema,
});

export const exitSchema = z.object({
  playerId: z.string().min(1),
  declareNoChips: z.boolean().optional(),
  note: z.string().max(2000).optional(),
});

export const drawerOpSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  kind: z.enum(["DEPOSIT", "WITHDRAWAL", "EXPENSE"]),
  amount: agorotPositive,
  reason: z.string().min(2, "חובה לציין סיבה"),
  paymentMethod: payableMethodSchema.optional(),
});

export const interimCountSchema = z.object({
  countedAmount: agorot,
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  notes: z.string().max(2000).optional(),
});

export const closeSessionSchema = z.object({
  countedClosingCashAmount: agorot,
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  differenceExplanation: z.string().max(2000).optional(),
  credential: z.string().min(1, "נדרש אימות סיסמה או PIN"),
  approval: approvalSchema,
  notes: z.string().max(2000).optional(),
  expectedVersion: z.number().int().optional(),
});

export const reopenSchema = z.object({ reason: z.string().min(3, "חובה לציין סיבה") });

export const reverseSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    batchId: z.string().optional(),
    transactionId: z.string().optional(),
    reason: z.string().min(3, "חובה לציין סיבת ביטול"),
    approval: approvalSchema,
  })
  .refine((v) => v.batchId || v.transactionId, { message: "חסר מזהה פעולה לביטול" });

export const adjustmentSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  target: z.enum(["DEBT", "CREDIT"]),
  sign: z.union([z.literal(1), z.literal(-1)]),
  amount: agorotPositive,
  reason: z.string().min(3, "חובה לציין סיבה"),
});

export const settingsUpdateSchema = z.object({
  organizationName: z.string().min(1).max(120).optional(),
  defaultBuyInButtons: z.array(agorotPositive).min(1).max(8).optional(),
  requireManagerApprovalForVoid: z.boolean().optional(),
  requireApprovalForReopen: z.boolean().optional(),
  requireApprovalForPayWithDebt: z.boolean().optional(),
  allowNegativeCashDrawer: z.boolean().optional(),
  defaultCashoutDebtBehavior: z.enum(["DEBT_FIRST", "PAY_FULL", "ASK"]).optional(),
  includeHistoricalDebtInCashout: z.boolean().optional(),
  creditLimitBehavior: z.enum(["WARN", "BLOCK"]).optional(),
  highAmountWarningThreshold: agorotPositive.optional(),
  sessionAutoLockMinutes: z.number().int().min(0).max(720).optional(),
});

export const roleSchema = z.enum(["OWNER", "MANAGER", "OPERATOR", "VIEWER"]);

export const userCreateSchema = z.object({
  name: z.string().min(2).max(80),
  username: z.string().regex(/^[a-zA-Z0-9._-]{3,32}$/, "שם משתמש 3–32 תווים באנגלית"),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
  role: roleSchema,
  pin: z.string().regex(/^\d{4,8}$/).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  pin: z.string().regex(/^\d{4,8}$/).nullable().optional(),
});
