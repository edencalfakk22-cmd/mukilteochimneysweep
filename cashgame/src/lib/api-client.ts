"use client";

/**
 * Client-side API helper.
 * - Never reports success before the server confirms (no optimistic writes).
 * - Surfaces typed error codes so forms can react (confirmation flows, locks).
 * - Detects offline state and fails fast with a clear Hebrew message.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details: unknown;
}

export class ApiError extends Error {
  code: string;
  details: unknown;
  status: number;
  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.code = shape.code;
    this.details = shape.details;
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError(0, {
      code: "OFFLINE",
      message: "אין חיבור לאינטרנט — הפעולה לא נשלחה",
      details: null,
    });
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK",
      message: "שגיאת רשת — לא ידוע אם הפעולה נקלטה. רענן ונסה שוב.",
      details: null,
    });
  }

  let json: { data?: unknown; error?: ApiErrorShape } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const shape = json?.error ?? {
      code: "INTERNAL",
      message: "אירעה שגיאה — נסה שוב",
      details: null,
    };
    if (res.status === 401 && typeof window !== "undefined") {
      const locked = (shape.details as { locked?: boolean } | null)?.locked;
      window.location.href = locked ? "/locked" : "/login";
    }
    throw new ApiError(res.status, shape);
  }

  return (json?.data ?? null) as T;
}
