import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, Errors } from "@/server/errors";
import { requireActor } from "@/server/auth";
import type { Actor } from "@/server/actor";

/** Convert any thrown error into a safe JSON response (no stack traces). */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.userMessage, details: err.details ?? null } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: first?.message ?? "קלט לא תקין",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "אירעה שגיאה — נסה שוב", details: null } },
    { status: 500 },
  );
}

/** CSRF: mutating requests must come from our own origin (SameSite cookie + Origin check). */
function checkOrigin(req: NextRequest): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (tests, curl) — cookie auth still applies
  const host = req.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw Errors.forbidden("בקשה נדחתה (origin לא תואם)");
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.forbidden("בקשה נדחתה (origin לא תקין)");
  }
}

type Ctx<P> = { params: Promise<P> };

/** Authenticated JSON API handler with validation and unified error handling. */
export function apiHandler<P = Record<string, never>>(
  fn: (req: NextRequest, actor: Actor, params: P) => Promise<NextResponse | Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      checkOrigin(req);
      const actor = await requireActor();
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, actor, params);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Unauthenticated handler (login, health). */
export function publicHandler<P = Record<string, never>>(
  fn: (req: NextRequest, params: P) => Promise<NextResponse | Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      checkOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw Errors.validation("גוף הבקשה אינו JSON תקין");
  }
  return schema.parse(json);
}

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}
