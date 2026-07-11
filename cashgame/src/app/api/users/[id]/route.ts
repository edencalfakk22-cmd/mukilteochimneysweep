import { apiHandler, parseBody, ok } from "@/server/api";
import { userUpdateSchema } from "@/server/schemas";
import { updateUser } from "@/server/services/org";

export const PATCH = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, userUpdateSchema);
  const user = await updateUser(actor, id, body);
  return ok({ user });
});
