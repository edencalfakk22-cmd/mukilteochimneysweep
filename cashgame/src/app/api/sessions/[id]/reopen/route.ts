import { apiHandler, parseBody, ok } from "@/server/api";
import { reopenSchema } from "@/server/schemas";
import { reopenSession } from "@/server/services/sessions";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, reopenSchema);
  const session = await reopenSession(actor, { ...body, sessionId: id });
  return ok({ session });
});
