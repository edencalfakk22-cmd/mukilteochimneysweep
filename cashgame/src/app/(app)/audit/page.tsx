"use client";

import * as React from "react";
import { useApi } from "@/lib/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  reason: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
  ipAddress: string | null;
}

const actionLabels: Record<string, string> = {
  LOGIN: "התחברות",
  LOGOUT: "התנתקות",
  BUY_IN: "קנייה",
  REBUY: "קנייה חוזרת",
  DEBT_PAYMENT: "תשלום חוב",
  CASH_OUT: "פדיון",
  REVERSAL: "ביטול פעולה",
  ADJUSTMENT: "התאמה ידנית",
  SESSION_OPEN: "פתיחת סשן",
  SESSION_CLOSE: "סגירת סשן",
  SESSION_REOPEN: "פתיחה מחדש",
  SESSION_PLAYER_ADD: "הוספת שחקן לסשן",
  SESSION_PLAYER_EXIT: "יציאת שחקן",
  PLAYER_CREATE: "יצירת שחקן",
  PLAYER_UPDATE: "עדכון שחקן",
  USER_CREATE: "יצירת משתמש",
  USER_UPDATE: "עדכון משתמש",
  USER_PIN_SET: "הגדרת PIN",
  USER_PIN_CLEARED: "מחיקת PIN",
  SETTINGS_UPDATE: "עדכון הגדרות",
  DRAWER_DEPOSIT: "הפקדה לקופה",
  DRAWER_WITHDRAWAL: "משיכה מקופה",
  DRAWER_EXPENSE: "הוצאה",
  DRAWER_INTERIM_COUNT: "ספירת ביניים",
};

export default function AuditPage() {
  const [action, setAction] = React.useState("");
  const { data, error, loading, refresh } = useApi<{ logs: AuditRow[]; nextCursor: string | null }>(
    `/api/audit${action ? `?action=${action}` : ""}`,
  );
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">יומן ביקורת</h1>
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="סינון לפי פעולה" className="w-48">
          <option value="">כל הפעולות</option>
          {Object.entries(actionLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      {loading && !data && <LoadingSkeleton rows={5} />}
      {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
      {data && data.logs.length === 0 && <EmptyState title="אין רשומות ביומן" />}

      <div className="space-y-2">
        {data?.logs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium" data-testid={`audit-${log.action}`}>
                    {actionLabels[log.action] ?? log.action}
                    <span className="ms-2 text-xs text-muted">{log.entityType}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(log.createdAt)} · {log.userName ?? "מערכת"}
                    {log.ipAddress && ` · ${log.ipAddress}`}
                  </p>
                  {log.reason && <p className="mt-1 text-sm">סיבה: {log.reason}</p>}
                </div>
                {(log.beforeJson != null || log.afterJson != null) && (
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                    {expanded === log.id ? "הסתר פרטים" : "פרטים"}
                  </Button>
                )}
              </div>
              {expanded === log.id && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {log.beforeJson != null && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted">לפני</p>
                      <pre dir="ltr" className="overflow-x-auto rounded-lg bg-surface-muted p-2 text-xs">
                        {JSON.stringify(log.beforeJson, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.afterJson != null && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted">אחרי</p>
                      <pre dir="ltr" className="overflow-x-auto rounded-lg bg-surface-muted p-2 text-xs">
                        {JSON.stringify(log.afterJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
