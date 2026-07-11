"use client";

import * as React from "react";
import { Wifi, WifiOff } from "lucide-react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Visible connectivity indicator. When offline, a prominent banner explains
 * that financial actions are disabled until the connection returns — we never
 * queue writes silently (financial correctness over fake offline support).
 */
export function ConnectionIndicator() {
  const online = React.useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true, // SSR: assume online
  );

  if (online) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-money-in" aria-live="polite">
        <Wifi className="h-4 w-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">מחובר</span>
      </span>
    );
  }
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-debt px-4 py-2 text-white"
    >
      <WifiOff className="h-5 w-5" aria-hidden />
      <span className="font-medium">אין חיבור לאינטרנט — פעולות כספיות מושבתות עד לחזרת החיבור</span>
    </div>
  );
}
