import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  PlaySquare,
  Users,
  HandCoins,
  FileBarChart,
  Settings,
  ScrollText,
} from "lucide-react";
import { getAuthState } from "@/server/auth";
import { hasAtLeastRole } from "@/server/actor";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { UserMenu } from "@/components/user-menu";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/", label: "ראשי", icon: LayoutDashboard },
  { href: "/sessions", label: "סשנים", icon: PlaySquare },
  { href: "/players", label: "שחקנים", icon: Users },
  { href: "/debts", label: "חובות", icon: HandCoins },
  { href: "/reports", label: "דוחות", icon: FileBarChart },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getAuthState();
  if (!state) redirect("/login");
  if (state.locked) redirect("/locked");

  const isManager = hasAtLeastRole(state.actor, "MANAGER");
  const isOwner = hasAtLeastRole(state.actor, "OWNER");

  const items = [
    ...navItems,
    ...(isManager ? [{ href: "/audit", label: "יומן", icon: ScrollText }] : []),
    ...(isOwner ? [{ href: "/settings", label: "הגדרות", icon: Settings }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionIndicator />
      <header className="no-print sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/" className="text-lg font-bold">
            ניהול קופה
          </Link>
          <nav aria-label="ניווט ראשי" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted"
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <UserMenu name={state.actor.name} role={state.actor.role} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-24 md:pb-8">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="ניווט תחתון"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex items-stretch justify-around">
          {items.slice(0, 5).map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium text-muted hover:text-foreground"
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
