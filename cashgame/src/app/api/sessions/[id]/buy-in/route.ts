import { apiHandler, parseBody, ok } from "@/server/api";
import { buyInSchema } from "@/server/schemas";
import { recordBuyIn } from "@/server/services/ledger";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, buyInSchema);
  const { result, duplicate } = await recordBuyIn(actor, { ...body, sessionId: id });
  return ok({ ...result, duplicate });
});
