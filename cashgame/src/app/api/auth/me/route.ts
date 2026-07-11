import { publicHandler, ok } from "@/server/api";
import { getAuthState } from "@/server/auth";

export const GET = publicHandler(async () => {
  const state = await getAuthState();
  if (!state) return ok({ user: null, locked: false });
  return ok({
    user: {
      id: state.actor.userId,
      name: state.actor.name,
      role: state.actor.role,
      hasPin: state.hasPin,
    },
    locked: state.locked,
  });
});
