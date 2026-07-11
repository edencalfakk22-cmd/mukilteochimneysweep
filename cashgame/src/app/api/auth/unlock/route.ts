import { publicHandler, parseBody, ok } from "@/server/api";
import { unlockSchema } from "@/server/schemas";
import { unlockWithPin, requestMeta, SESSION_COOKIE } from "@/server/auth";

export const POST = publicHandler(async (req) => {
  const body = await parseBody(req, unlockSchema);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const result = await unlockWithPin(token, body.pin, requestMeta(req));
  return ok(result);
});
