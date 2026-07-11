import { apiHandler, parseBody, ok } from "@/server/api";
import { setPinSchema } from "@/server/schemas";
import { setOwnPin } from "@/server/services/org";

export const POST = apiHandler(async (req, actor) => {
  const body = await parseBody(req, setPinSchema);
  const result = await setOwnPin(actor, body.currentPassword, body.pin);
  return ok(result);
});
