import { apiHandler, parseBody, ok } from "@/server/api";
import { closeSessionSchema } from "@/server/schemas";
import { closeSession } from "@/server/services/sessions";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, closeSessionSchema);
  const result = await closeSession(actor, { ...body, sessionId: id });
  return ok(result);
});
