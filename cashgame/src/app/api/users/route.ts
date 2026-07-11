import { apiHandler, parseBody, ok } from "@/server/api";
import { userCreateSchema } from "@/server/schemas";
import { createUser, listUsers } from "@/server/services/org";

export const GET = apiHandler(async (_req, actor) => {
  const users = await listUsers(actor);
  return ok({ users });
});

export const POST = apiHandler(async (req, actor) => {
  const body = await parseBody(req, userCreateSchema);
  const user = await createUser(actor, body);
  return ok({ user }, { status: 201 });
});
