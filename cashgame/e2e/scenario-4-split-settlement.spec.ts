import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, exitPlayer, closeSession, ILS } from "./helpers";

/**
 * Scenario 4: unpaid 2,000 buy-in, player returns 3,000 —
 * 2,000 applied to debt, 1,000 paid in cash → debt 0, result +1,000.
 */
test("scenario 4: winning cash-out settles debt then pays cash", async ({ page }) => {
  const who = "מנצח גדול";
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, "בדיקה 4 — חלוקה", 2000);

  await addPlayer(page, { newName: who, chips: 2000, payMode: "NONE" });
  const card = page.getByTestId(`player-card-${who}`);
  await expect(card).toContainText(`חוב ${ILS(2000)}`);

  await page.getByTestId(`action-cashout-${who}`).click();
  await page.fill("#cashout-chips", "3000");
  await page.getByTestId("cashout-continue").click();
  // Preview: 2,000 to debt, 1,000 cash, debt 0, result +1,000
  await expect(page.getByTestId("cashout-summary")).toContainText("קיזוז חוב הסשן");
  await expect(page.getByTestId("cashout-debt-after")).toHaveText(ILS(0));
  await page.getByTestId("cashout-confirm").click();
  await expect(page.getByTestId("cashout-confirm")).toBeHidden();

  await expect(card).toContainText("ללא חוב");
  await expect(page.getByTestId(`player-result-${who}`)).toHaveText(`+${ILS(1000)}`);

  // Drawer: 2,000 opening - 1,000 paid out
  await expect(page.getByTestId("summary-expected-cash")).toHaveText(ILS(1000));

  await exitPlayer(page, who);
  await closeSession(page, sessionId, 1000);
  await expect(page.getByTestId("report-difference")).toHaveText(ILS(0));
});
