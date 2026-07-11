import { apiHandler, ok } from "@/server/api";
import { getDebtOverview } from "@/server/services/players";

export const GET = apiHandler(async (_req, actor) => {
  const overview = await getDebtOverview(actor.organizationId);
  return ok(overview);
});
