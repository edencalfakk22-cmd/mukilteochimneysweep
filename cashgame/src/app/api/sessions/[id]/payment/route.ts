import { apiHandler, parseBody, ok } from "@/server/api";
import { paymentSchema } from "@/server/schemas";
import { recordPayment } from "@/server/services/ledger";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, paymentSchema);
  const { result, duplicate } = await recordPayment(actor, { ...body, sessionId: id });
  return ok({ ...result, duplicate });
});
