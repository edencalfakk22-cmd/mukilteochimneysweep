"use client";

import * as React from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DebtBadge } from "@/components/domain-badges";
import { MoneyDisplay } from "@/components/money";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";

interface PlayerRow {
  id: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  isActive: boolean;
  currentDebt: number;
  currentCredit: number;
  creditLimit: number | null;
}

export default function PlayersPage() {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const { data, error, loading, refresh } = useApi<{ players: PlayerRow[] }>(
    `/api/players?q=${encodeURIComponent(debouncedQuery)}`,
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newNickname, setNewNickname] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  async function createPlayer() {
    if (newName.trim().length < 2) {
      toast.error("יש להזין שם שחקן");
      return;
    }
    setSaving(true);
    try {
      await api("/api/players", {
        method: "POST",
        body: { fullName: newName.trim(), phone: newPhone || undefined, nickname: newNickname || undefined },
      });
      toast.success("השחקן נוצר");
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewNickname("");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "אירעה שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">שחקנים</h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="create-player">
          <UserPlus className="h-5 w-5" aria-hidden />
          שחקן חדש
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          placeholder="חיפוש לפי שם, כינוי או טלפון..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="חיפוש שחקן"
        />
      </div>

      {loading && !data && <LoadingSkeleton rows={4} />}
      {error && !data && <ErrorState message={error} onRetry={() => refresh(false)} />}
      {data && data.players.length === 0 && <EmptyState title="לא נמצאו שחקנים" />}

      <div className="grid gap-2 md:grid-cols-2">
        {data?.players.map((p) => (
          <Link key={p.id} href={`/players/${p.id}`}>
            <Card className={`transition-colors hover:bg-surface-muted ${!p.isActive ? "opacity-60" : ""}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold">
                    {p.fullName}
                    {p.nickname && <span className="ms-2 text-sm font-normal text-muted">({p.nickname})</span>}
                    {!p.isActive && <span className="ms-2 text-xs text-muted">(לא פעיל)</span>}
                  </p>
                  {p.phone && (
                    <p className="num text-sm text-muted" dir="ltr">
                      {p.phone}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <DebtBadge amount={p.currentDebt} />
                  {p.currentCredit > 0 && (
                    <span className="text-xs text-money-in">
                      יתרת זכות: <MoneyDisplay amount={p.currentCredit} tone="green" className="text-xs" />
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="שחקן חדש">
          <div className="space-y-4">
            <div>
              <Label htmlFor="cp-name">שם מלא</Label>
              <Input id="cp-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cp-nick">כינוי</Label>
                <Input id="cp-nick" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cp-phone">טלפון</Label>
                <Input id="cp-phone" dir="ltr" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={createPlayer} loading={saving}>
              יצירת שחקן
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
