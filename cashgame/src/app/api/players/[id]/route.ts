import { apiHandler, parseBody, ok } from "@/server/api";
import { playerUpdateSchema } from "@/server/schemas";
import { getPlayerProfile, updatePlayer } from "@/server/services/players";

export const GET = apiHandler<{ id: string }>(async (_req, actor, { id }) => {
  const profile = await getPlayerProfile(actor.organizationId, id);
  return ok(profile);
});

export const PATCH = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const body = await parseBody(req, playerUpdateSchema);
  const player = await updatePlayer(actor, id, body);
  return ok({ player });
});
