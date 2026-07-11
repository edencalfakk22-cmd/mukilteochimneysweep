import { apiHandler, ok } from "@/server/api";
import { getSessionState } from "@/server/services/sessions";
import { getOrgSettings } from "@/server/services/org";

export const GET = apiHandler<{ id: string }>(async (_req, actor, { id }) => {
  const [state, settings] = await Promise.all([
    getSessionState(actor.organizationId, id),
    getOrgSettings(actor.organizationId),
  ]);
  return ok({
    ...state,
    settings: {
      defaultBuyInButtons: settings.defaultBuyInButtons,
      defaultCashoutDebtBehavior: settings.defaultCashoutDebtBehavior,
      includeHistoricalDebtInCashout: settings.includeHistoricalDebtInCashout,
      highAmountWarningThreshold: settings.highAmountWarningThreshold,
      requireManagerApprovalForVoid: settings.requireManagerApprovalForVoid,
      requireApprovalForPayWithDebt: settings.requireApprovalForPayWithDebt,
    },
    viewer: { role: actor.role, name: actor.name },
  });
});
