import { NextResponse } from "next/server";
import { publicHandler, parseBody, ok } from "@/server/api";
import { loginSchema } from "@/server/schemas";
import { login, requestMeta, SESSION_COOKIE } from "@/server/auth";

export const POST = publicHandler(async (req) => {
  const body = await parseBody(req, loginSchema);
  const { token, user } = await login(body.username, body.password, requestMeta(req));
  const res = ok({ user }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
});
