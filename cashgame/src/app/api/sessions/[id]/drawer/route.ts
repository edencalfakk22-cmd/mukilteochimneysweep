import { apiHandler, parseBody, ok } from "@/server/api";
import { drawerOpSchema, interimCountSchema } from "@/server/schemas";
import { recordDrawerOp } from "@/server/services/ledger";
import { recordInterimCount } from "@/server/services/sessions";
import { z } from "zod";

const bodySchema = z.union([
  z.object({ action: z.literal("op") }).and(drawerOpSchema),
  z.object({ action: z.literal("count") }).and(interimCountSchema),
]);

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, bodySchema);
  if (body.action === "op") {
    const { result, duplicate } = await recordDrawerOp(actor, { ...body, sessionId: id });
    return ok({ ...result, duplicate });
  }
  const count = await recordInterimCount(actor, { ...body, sessionId: id });
  return ok({ count });
});
