import { apiHandler, parseBody, ok } from "@/server/api";
import { adjustmentSchema } from "@/server/schemas";
import { recordAdjustment } from "@/server/services/ledger";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, adjustmentSchema);
  const { result, duplicate } = await recordAdjustment(actor, { ...body, playerId: id });
  return ok({ ...result, duplicate });
});
