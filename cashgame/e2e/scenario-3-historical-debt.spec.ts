import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, exitPlayer, closeSession, ILS } from "./helpers";

/**
 * Scenario 3: historical debt is never overwritten by a later settled session.
 * נועם אוחיון carries a 1,000 ₪ debt from the seeded active session. He joins a
 * new session, buys 500 paid in full, loses the chips — the session is settled
 * and the 1,000 ₪ historical debt remains intact.
 */
test("scenario 3: historical debt survives a settled session", async ({ page }) => {
  const who = "נועם אוחיון";
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, "בדיקה 3 — חוב היסטורי", 2000);

  await addPlayer(page, { existingName: who, chips: 500, payMode: "FULL", method: "CASH" });

  const card = page.getByTestId(`player-card-${who}`);
  // Total debt shows 1,000 (all historical), marked explicitly.
  await expect(card).toContainText(`חוב ${ILS(1000)}`);
  await expect(card).toContainText("חוב קודם");

  // Player returns zero chips → exit with declaration.
  await exitPlayer(page, who, true);

  // Debt still exactly 1,000 — not overwritten by the settled session.
  await expect(card).toContainText(`חוב ${ILS(1000)}`);

  await closeSession(page, sessionId, 2500);
  await expect(page.getByTestId("report-difference")).toHaveText(ILS(0));

  // Verify on the debts screen as well.
  await page.goto("/debts");
  const row = page.getByText(who).first();
  await expect(row).toBeVisible();
});
