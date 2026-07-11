import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, cashOut, exitPlayer, closeSession, expectSummaryCash, ILS } from "./helpers";

/**
 * Scenario 1: clean winning night, zero reconciliation difference.
 * Opening 5,000 → player buys 1,000 (paid cash) → expected 6,000 →
 * cash-out 1,500 (paid cash) → expected 4,500, result +500 →
 * close with counted 4,500 → difference 0.
 */
test("scenario 1: clean session with winning player", async ({ page }, testInfo) => {
  const who = `אבי כהן`;
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, `בדיקה 1 ${testInfo.project.name}`, 5000);

  await addPlayer(page, { existingName: who, chips: 1000, payMode: "FULL", method: "CASH" });
  await expectSummaryCash(page, 6000);

  await cashOut(page, who, 1500);
  await expectSummaryCash(page, 4500);
  await expect(page.getByTestId(`player-result-${who}`)).toHaveText(`+${ILS(500)}`);

  await exitPlayer(page, who);
  await closeSession(page, sessionId, 4500);

  await expect(page.getByTestId("report-difference")).toHaveText(ILS(0));
});
