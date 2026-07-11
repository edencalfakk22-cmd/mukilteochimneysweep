import { apiHandler, parseBody, ok } from "@/server/api";
import { settingsUpdateSchema } from "@/server/schemas";
import { getOrgSettings, updateSettings, getOrganization } from "@/server/services/org";
import { requireRole } from "@/server/actor";

export const GET = apiHandler(async (_req, actor) => {
  requireRole(actor, "MANAGER");
  const [settings, org] = await Promise.all([getOrgSettings(actor.organizationId), getOrganization()]);
  return ok({ settings, organization: { id: org.id, name: org.name, timezone: org.timezone } });
});

export const PATCH = apiHandler(async (req, actor) => {
  const body = await parseBody(req, settingsUpdateSchema);
  const settings = await updateSettings(actor, body);
  return ok({ settings });
});
