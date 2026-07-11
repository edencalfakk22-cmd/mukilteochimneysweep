import { apiHandler, parseBody, ok } from "@/server/api";
import { cashOutSchema } from "@/server/schemas";
import { recordCashOut } from "@/server/services/ledger";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, cashOutSchema);
  const { result, duplicate } = await recordCashOut(actor, { ...body, sessionId: id });
  return ok({ ...result, duplicate });
});
