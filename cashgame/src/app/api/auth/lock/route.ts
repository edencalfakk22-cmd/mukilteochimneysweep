import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { publicHandler, ok } from "@/server/api";
import { SESSION_COOKIE } from "@/server/auth";
import { prisma } from "@/server/db";

/** Manually lock the current device session (menu action). */
export const POST = publicHandler(async (req: NextRequest) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = createHash("sha256")
      .update(token + (process.env.SESSION_SECRET ?? ""))
      .digest("hex");
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { lockedAt: new Date() },
    });
  }
  return ok({ locked: true });
});
