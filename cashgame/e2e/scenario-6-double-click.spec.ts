import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, ILS } from "./helpers";

/**
 * Scenario 6: double-clicking a buy-in submit creates exactly one
 * financial operation (submit disabled while saving + server idempotency key).
 */
test("scenario 6: double click creates a single buy-in", async ({ page }) => {
  const who = "לחצן כפול";
  await login(page, "owner", "Owner123!");
  await createSession(page, "בדיקה 6 — קליק כפול", 1000);
  await addPlayer(page, { newName: who, chips: 500, payMode: "FULL", method: "CASH" });

  // Rebuy with a double click on the confirm button.
  await page.getByTestId(`action-buyin-${who}`).click();
  await page.fill("#buyin-chips", "300");
  await page.getByTestId("buyin-continue").click();
  await page.getByTestId("buyin-confirm").dblclick();
  await expect(page.getByTestId("buyin-confirm")).toBeHidden();

  // Exactly one rebuy: chips total is 800, not 1100.
  const card = page.getByTestId(`player-card-${who}`);
  await expect(card).toContainText(ILS(800));

  // History shows exactly one rebuy row.
  await page.getByTestId(`action-history-${who}`).click();
  await expect(page.getByTestId("tx-SESSION_REBUY-ACTIVE")).toHaveCount(1);
});
