import { apiHandler, parseBody, ok } from "@/server/api";
import { reverseSchema } from "@/server/schemas";
import { reverseTransactions } from "@/server/services/ledger";

export const POST = apiHandler(async (req, actor) => {
  const body = await parseBody(req, reverseSchema);
  const { result, duplicate } = await reverseTransactions(actor, body);
  return ok({ ...result, duplicate });
});
