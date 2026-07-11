import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, exitPlayer, closeSession, ILS } from "./helpers";

/**
 * Scenario 2: partial payment creates debt; cash-out is applied to the debt.
 * 2,000 chips, paid 500 → debt 1,500 → cash-out 1,200 applied to debt →
 * no cash paid, debt 300 → close successfully.
 */
test("scenario 2: unpaid buy-in and cash-out against debt", async ({ page }, testInfo) => {
  const who = `חייב ${testInfo.project.name}`;
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, `בדיקה 2 ${testInfo.project.name}`, 3000);

  await addPlayer(page, { newName: who, chips: 2000, payMode: "PARTIAL", paidNow: 500, method: "CASH" });

  // Debt 1,500 visible on the player card
  const card = page.getByTestId(`player-card-${who}`);
  await expect(card).toContainText(`חוב ${ILS(1500)}`);

  // Cash-out 1,200 with debt-first strategy: verify preview then confirm
  await page.getByTestId(`action-cashout-${who}`).click();
  await page.fill("#cashout-chips", "1200");
  await page.getByTestId("cashout-continue").click();
  await expect(page.getByTestId("cashout-debt-after")).toHaveText(ILS(300));
  await expect(page.getByTestId("cashout-summary")).toContainText("קיזוז חוב הסשן");
  await page.getByTestId("cashout-confirm").click();
  await expect(page.getByTestId("cashout-confirm")).toBeHidden();

  // No cash was paid out: expected cash = 3,000 + 500
  await expect(page.getByTestId("summary-expected-cash")).toHaveText(ILS(3500));
  await expect(card).toContainText(`חוב ${ILS(300)}`);

  // Exit with remaining debt (800 unsettled chips declared lost)
  await exitPlayer(page, who, true);
  await closeSession(page, sessionId, 3500);
  await expect(page.getByTestId("report-difference")).toHaveText(ILS(0));
});
