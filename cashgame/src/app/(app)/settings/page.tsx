"use client";

import * as React from "react";
import { toast } from "sonner";
import * as Tabs from "@radix-ui/react-tabs";
import { UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { roleLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@prisma/client";

interface SettingsDto {
  settings: {
    defaultBuyInButtons: number[];
    requireManagerApprovalForVoid: boolean;
    requireApprovalForReopen: boolean;
    requireApprovalForPayWithDebt: boolean;
    allowNegativeCashDrawer: boolean;
    defaultCashoutDebtBehavior: "DEBT_FIRST" | "PAY_FULL" | "ASK";
    includeHistoricalDebtInCashout: boolean;
    creditLimitBehavior: "WARN" | "BLOCK";
    highAmountWarningThreshold: number;
    sessionAutoLockMinutes: number;
  };
  organization: { id: string; name: string; timezone: string };
}

interface UserRow {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  hasPin: boolean;
}

export default function SettingsPage() {
  const { data, error, loading, refresh } = useApi<SettingsDto>("/api/settings");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הגדרות</h1>
      {loading && !data && <LoadingSkeleton rows={4} />}
      {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
      {data && (
        <Tabs.Root dir="rtl" defaultValue="general">
          <Tabs.List className="mb-4 flex gap-1 border-b border-border" aria-label="הגדרות">
            <Tabs.Trigger
              value="general"
              className="rounded-t-lg px-4 py-2 font-medium data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              כללי
            </Tabs.Trigger>
            <Tabs.Trigger
              value="users"
              className="rounded-t-lg px-4 py-2 font-medium data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              משתמשים
            </Tabs.Trigger>
            <Tabs.Trigger
              value="data"
              className="rounded-t-lg px-4 py-2 font-medium data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              נתונים וגיבוי
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="general">
            <GeneralSettings data={data} onSaved={refresh} />
          </Tabs.Content>
          <Tabs.Content value="users">
            <UsersPanel />
          </Tabs.Content>
          <Tabs.Content value="data">
            <DataPanel />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  );
}

function GeneralSettings({ data, onSaved }: { data: SettingsDto; onSaved: () => void }) {
  const s = data.settings;
  const [orgName, setOrgName] = React.useState(data.organization.name);
  const [buttons, setButtons] = React.useState(s.defaultBuyInButtons.map((b) => String(b / 100)).join(", "));
  const [threshold, setThreshold] = React.useState(String(s.highAmountWarningThreshold / 100));
  const [autoLock, setAutoLock] = React.useState(String(s.sessionAutoLockMinutes));
  const [cashoutBehavior, setCashoutBehavior] = React.useState(s.defaultCashoutDebtBehavior);
  const [creditBehavior, setCreditBehavior] = React.useState(s.creditLimitBehavior);
  const [includeHistorical, setIncludeHistorical] = React.useState(s.includeHistoricalDebtInCashout);
  const [voidApproval, setVoidApproval] = React.useState(s.requireManagerApprovalForVoid);
  const [payWithDebtApproval, setPayWithDebtApproval] = React.useState(s.requireApprovalForPayWithDebt);
  const [negativeDrawer, setNegativeDrawer] = React.useState(s.allowNegativeCashDrawer);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const parsedButtons = buttons
      .split(",")
      .map((v) => Math.round(Number(v.trim()) * 100))
      .filter((v) => Number.isSafeInteger(v) && v > 0);
    if (parsedButtons.length === 0) {
      toast.error("יש להזין לפחות סכום קנייה מהירה אחד");
      return;
    }
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: {
          organizationName: orgName,
          defaultBuyInButtons: parsedButtons,
          highAmountWarningThreshold: Math.round(Number(threshold) * 100) || undefined,
          sessionAutoLockMinutes: Number(autoLock),
          defaultCashoutDebtBehavior: cashoutBehavior,
          creditLimitBehavior: creditBehavior,
          includeHistoricalDebtInCashout: includeHistorical,
          requireManagerApprovalForVoid: voidApproval,
          requireApprovalForPayWithDebt: payWithDebtApproval,
          allowNegativeCashDrawer: negativeDrawer,
        },
      });
      toast.success("ההגדרות נשמרו");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <Label htmlFor="org-name">שם הארגון</Label>
          <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="quick-buttons">סכומי קנייה מהירה (₪, מופרדים בפסיק)</Label>
          <Input id="quick-buttons" dir="ltr" value={buttons} onChange={(e) => setButtons(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="threshold">סף אזהרת סכום גבוה (₪)</Label>
            <Input id="threshold" dir="ltr" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="autolock">נעילת מסך אוטומטית (דקות, 0 = כבוי)</Label>
            <Input id="autolock" dir="ltr" inputMode="numeric" value={autoLock} onChange={(e) => setAutoLock(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="cashout-behavior">ברירת מחדל בפדיון</Label>
          <Select id="cashout-behavior" value={cashoutBehavior} onChange={(e) => setCashoutBehavior(e.target.value as typeof cashoutBehavior)}>
            <option value="DEBT_FIRST">קיזוז חוב קודם</option>
            <option value="PAY_FULL">תשלום מלא לשחקן</option>
            <option value="ASK">שאל בכל פעם</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="credit-behavior">חריגה ממסגרת אשראי</Label>
          <Select id="credit-behavior" value={creditBehavior} onChange={(e) => setCreditBehavior(e.target.value as typeof creditBehavior)}>
            <option value="WARN">אזהרה בלבד</option>
            <option value="BLOCK">חסימה (נדרש אישור מנהל)</option>
          </Select>
        </div>
        {[
          { label: "כלול חוב קודם בקיזוז פדיון", value: includeHistorical, set: setIncludeHistorical },
          { label: "דרוש אישור מנהל לביטול פעולה (למפעילים)", value: voidApproval, set: setVoidApproval },
          { label: "דרוש אישור מנהל לפדיון מלא כשקיים חוב", value: payWithDebtApproval, set: setPayWithDebtApproval },
          { label: "אפשר יתרת קופה שלילית (לא מומלץ)", value: negativeDrawer, set: setNegativeDrawer },
        ].map((row) => (
          <label key={row.label} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="text-sm font-medium">{row.label}</span>
            <input type="checkbox" className="h-5 w-5" checked={row.value} onChange={(e) => row.set(e.target.checked)} />
          </label>
        ))}
        <Button size="lg" onClick={save} loading={saving}>
          שמירת הגדרות
        </Button>
      </CardContent>
    </Card>
  );
}

function UsersPanel() {
  const { data, error, loading, refresh } = useApi<{ users: UserRow[] }>("/api/users");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserRow | null>(null);
  // Changing key remounts dialogs so every open starts with fresh form state.
  const [nonce, setNonce] = React.useState(0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>משתמשים</CardTitle>
        <Button onClick={() => { setNonce((n) => n + 1); setCreateOpen(true); }}>
          <UserPlus className="h-5 w-5" aria-hidden />
          משתמש חדש
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && !data && <LoadingSkeleton rows={3} />}
        {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
        {data?.users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div>
              <p className="font-medium">
                {u.name} <span className="num text-sm text-muted">({u.username})</span>
              </p>
              <p className="text-xs text-muted">
                {u.lastLoginAt ? `התחברות אחרונה: ${formatDateTime(u.lastLoginAt)}` : "טרם התחבר"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={u.role === "OWNER" ? "blue" : "neutral"}>{roleLabels[u.role]}</Badge>
              {!u.isActive && <Badge tone="red">מושבת</Badge>}
              {u.hasPin && <Badge tone="green">PIN</Badge>}
              <Button variant="secondary" size="sm" onClick={() => { setNonce((n) => n + 1); setEditUser(u); }}>
                עריכה
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <UserDialog key={`create-${nonce}`} open={createOpen} onOpenChange={setCreateOpen} onDone={refresh} user={null} />
      <UserDialog key={`edit-${nonce}`} open={editUser != null} onOpenChange={(o) => !o && setEditUser(null)} onDone={refresh} user={editUser} />
    </Card>
  );
}

function UserDialog({
  open,
  onOpenChange,
  onDone,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  user: UserRow | null;
}) {
  const [name, setName] = React.useState(user?.name ?? "");
  const [username, setUsername] = React.useState(user?.username ?? "");
  const [password, setPassword] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [role, setRole] = React.useState<Role>(user?.role ?? "OPERATOR");
  const [isActive, setIsActive] = React.useState(user?.isActive ?? true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initial values come from props at mount; the parent remounts per open.

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (user) {
        await api(`/api/users/${user.id}`, {
          method: "PATCH",
          body: {
            name,
            role,
            isActive,
            password: password || undefined,
            pin: pin || undefined,
          },
        });
      } else {
        await api("/api/users", {
          method: "POST",
          body: { name, username, password, role, pin: pin || undefined },
        });
      }
      toast.success(user ? "המשתמש עודכן" : "המשתמש נוצר");
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent title={user ? `עריכת משתמש — ${user.name}` : "משתמש חדש"}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="u-name">שם מלא</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!user && (
            <div>
              <Label htmlFor="u-username">שם משתמש (באנגלית)</Label>
              <Input id="u-username" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="u-password">{user ? "סיסמה חדשה (ריק = ללא שינוי)" : "סיסמה (לפחות 8 תווים)"}</Label>
            <Input id="u-password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="u-pin">קוד PIN (לא חובה, 4–8 ספרות)</Label>
            <Input id="u-pin" type="password" dir="ltr" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="u-role">תפקיד</Label>
            <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(["OWNER", "MANAGER", "OPERATOR", "VIEWER"] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
          </div>
          {user && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              משתמש פעיל
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={submit} loading={saving}>
            {user ? "שמירה" : "יצירת משתמש"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DataPanel() {
  return (
    <Card>
      <CardContent className="space-y-4 p-4 text-sm leading-6">
        <div>
          <h3 className="mb-1 font-bold">ייצוא נתונים</h3>
          <p className="text-muted">
            דוחות PDF/Excel/CSV זמינים ממסכי הדוחות, החובות ופרופיל השחקן.
          </p>
        </div>
        <div>
          <h3 className="mb-1 font-bold">גיבוי</h3>
          <p className="text-muted">
            גיבוי בסיס הנתונים מתבצע עם הסקריפטים <code dir="ltr">scripts/backup.sh</code> ו־
            <code dir="ltr">scripts/restore.sh</code>. הוראות מלאות בקובץ README.md, כולל הגדרת גיבוי יומי
            אוטומטי.
          </p>
        </div>
        <div>
          <h3 className="mb-1 font-bold">שמירת יומן ביקורת</h3>
          <p className="text-muted">
            רשומות יומן הביקורת ורשומות פיננסיות לעולם אינן נמחקות מהמערכת. תיקונים מבוצעים באמצעות
            פעולות ביטול בלבד.
          </p>
        </div>
        <div>
          <h3 className="mb-1 font-bold">בדיקת שלמות</h3>
          <p className="text-muted">
            להרצת בדיקת שלמות מלאה של ספר החשבונות: <code dir="ltr">npm run verify-ledger</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
