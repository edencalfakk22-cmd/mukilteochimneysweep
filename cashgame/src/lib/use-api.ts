"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api-client";

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Simple data hook: fetch on mount / path change, manual refresh, optional polling. */
export function useApi<T>(path: string | null, opts?: { pollMs?: number }) {
  const [state, setState] = React.useState<ApiState<T>>({ data: null, error: null, loading: !!path });
  // Incrementing the tick re-runs the fetch effect (manual refresh / polling).
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((result) => {
        if (!cancelled) setState({ data: result, error: null, loading: false });
      })
      .catch((e) => {
        if (!cancelled) {
          setState((s) => ({
            data: s.data,
            error: e instanceof ApiError ? e.message : "אירעה שגיאה בטעינת הנתונים",
            loading: false,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  React.useEffect(() => {
    if (!opts?.pollMs || !path) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) setTick((n) => n + 1);
    }, opts.pollMs);
    return () => clearInterval(t);
  }, [opts?.pollMs, path]);

  const refresh = React.useCallback((silent = true) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    setTick((n) => n + 1);
  }, []);

  return { data: state.data, error: state.error, loading: state.loading, refresh };
}
