import { apiHandler, parseBody, ok } from "@/server/api";
import { paymentSchema } from "@/server/schemas";
import { recordPayment } from "@/server/services/ledger";

/** Standalone debt payment from the player profile (not inside a session). */
export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, paymentSchema.omit({ playerId: true }));
  const { result, duplicate } = await recordPayment(actor, {
    ...body,
    playerId: id,
    sessionId: null,
    strategy: body.strategy ?? "OLDEST_FIRST",
  });
  return ok({ ...result, duplicate });
});
