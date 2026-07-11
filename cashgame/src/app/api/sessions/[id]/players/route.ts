import { apiHandler, parseBody, ok } from "@/server/api";
import { addPlayerSchema } from "@/server/schemas";
import { addPlayerToSession } from "@/server/services/sessions";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, addPlayerSchema);
  const result = await addPlayerToSession(actor, { ...body, sessionId: id });
  return ok(result, { status: 201 });
});
