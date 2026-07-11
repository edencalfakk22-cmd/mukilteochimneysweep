import type { PaymentMethod, SessionStatus, SessionPlayerStatus, TransactionType, TransactionStatus, CountType } from "@prisma/client";

export interface PlayerSessionStatsDto {
  chipsIssued: number;
  paymentsReceived: number;
  chipsReturned: number;
  cashPaidToPlayer: number;
  creditUsed: number;
  creditCreated: number;
  debtCreated: number;
  sessionDebtReduced: number;
  sessionDebtOutstanding: number;
  unsettledChips: number;
  playerPosition: number;
  lastActivityAt: string | null;
}

export interface SessionPlayerDto {
  sessionPlayerId: string;
  playerId: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  status: SessionPlayerStatus;
  seatNumber: number | null;
  joinedAt: string;
  leftAt: string | null;
  creditLimit: number | null;
  credit: number;
  stats: PlayerSessionStatsDto;
  debt: { sessionDebt: number; historicalDebt: number; totalDebt: number };
}

export interface MethodBreakdownDto {
  CASH: number;
  BIT: number;
  BANK_TRANSFER: number;
  CREDIT_CARD: number;
  OTHER: number;
}

export interface SessionTotalsDto {
  chipsIssued: number;
  chipsReturned: number;
  chipsOutstanding: number;
  paymentsIn: MethodBreakdownDto;
  paymentsInTotal: number;
  paidOut: MethodBreakdownDto;
  paidOutTotal: number;
  debtCreated: number;
  debtCollected: number;
  creditCreated: number;
  creditUsed: number;
  drawerDeposits: number;
  drawerWithdrawals: number;
  cashExpenses: number;
  expensesTotal: number;
  unpaidBuyIns: number;
}

export interface LedgerRowDto {
  id: string;
  type: TransactionType;
  amount: number;
  paymentMethod: PaymentMethod | null;
  playerId: string | null;
  status: TransactionStatus;
  createdAt: string;
  createdByName?: string;
  batchId: string | null;
  notes: string | null;
}

export interface CashCountDto {
  id: string;
  countType: CountType;
  countedAmount: number;
  expectedAmount: number;
  difference: number;
  createdAt: string;
  notes: string | null;
}

export interface SessionSettingsDto {
  defaultBuyInButtons: number[];
  defaultCashoutDebtBehavior: "DEBT_FIRST" | "PAY_FULL" | "ASK";
  includeHistoricalDebtInCashout: boolean;
  highAmountWarningThreshold: number;
  requireManagerApprovalForVoid: boolean;
  requireApprovalForPayWithDebt: boolean;
}

export interface SessionStateDto {
  session: {
    id: string;
    name: string;
    status: SessionStatus;
    startedAt: string;
    endedAt: string | null;
    openingCashAmount: number;
    countedClosingCashAmount: number | null;
    notes: string | null;
    version: number;
    openedBy: { id: string; name: string };
    closedBy: { id: string; name: string } | null;
  };
  players: SessionPlayerDto[];
  totals: SessionTotalsDto;
  expectedCash: number;
  openSessionDebt: number;
  activePlayers: number;
  cashCounts: CashCountDto[];
  ledger: LedgerRowDto[];
  settings: SessionSettingsDto;
  viewer: { role: string; name: string };
}

export function isWritableStatus(status: SessionStatus): boolean {
  return status === "OPEN" || status === "REOPENED" || status === "CLOSING";
}
