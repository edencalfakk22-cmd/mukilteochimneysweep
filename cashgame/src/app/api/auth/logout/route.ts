import { NextResponse } from "next/server";
import { publicHandler, ok } from "@/server/api";
import { logout, requestMeta, SESSION_COOKIE } from "@/server/auth";

export const POST = publicHandler(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  await logout(token, requestMeta(req));
  const res = ok({ loggedOut: true }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
