"use client";

import * as React from "react";

/**
 * Warns before the browser navigates away (refresh/close/back) while a
 * financial form holds unsaved values (UX rule: never lose entered money data
 * silently). In-app dialog dismissal is already guarded by the dialogs
 * themselves (outside-click is disabled while a form is dirty/saving).
 */
export function useUnsavedGuard(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for Chrome to show the confirmation prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
