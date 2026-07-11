"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { CircleUser, Lock, LogOut, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { roleLabels } from "@/lib/labels";
import type { Role } from "@prisma/client";
import { PinDialog } from "@/components/pin-dialog";

export function UserMenu({ name, role }: { name: string; role: Role }) {
  const router = useRouter();
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pinNonce, setPinNonce] = React.useState(0);

  return (
    <>
      <Dropdown.Root dir="rtl">
        <Dropdown.Trigger
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
          aria-label={`תפריט משתמש — ${name}`}
        >
          <CircleUser className="h-6 w-6 text-muted" aria-hidden />
          <span className="hidden text-sm font-medium sm:block">
            {name}
            <span className="ms-1 text-xs text-muted">({roleLabels[role]})</span>
          </span>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg"
          >
            <Dropdown.Item
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-surface-muted"
              onSelect={() => {
                setPinNonce((n) => n + 1);
                setPinOpen(true);
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              הגדרת קוד PIN
            </Dropdown.Item>
            <Dropdown.Item
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-surface-muted"
              onSelect={async () => {
                await api("/api/auth/lock", { method: "POST" }).catch(() => undefined);
                router.push("/locked");
              }}
            >
              <Lock className="h-4 w-4" aria-hidden />
              נעילת מסך
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 h-px bg-border" />
            <Dropdown.Item
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-debt outline-none hover:bg-debt-bg"
              onSelect={async () => {
                try {
                  await api("/api/auth/logout", { method: "POST" });
                } catch {
                  /* logout is best-effort */
                }
                toast.success("התנתקת מהמערכת");
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              התנתקות
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <PinDialog key={pinNonce} open={pinOpen} onOpenChange={setPinOpen} />
    </>
  );
}
