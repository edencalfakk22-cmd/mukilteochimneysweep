import { apiHandler, parseBody, ok } from "@/server/api";
import { exitSchema } from "@/server/schemas";
import { exitPlayer } from "@/server/services/sessions";

export const POST = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, exitSchema);
  const result = await exitPlayer(actor, { ...body, sessionId: id });
  return ok(result);
});
