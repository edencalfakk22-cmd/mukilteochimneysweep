import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, exitPlayer, ILS } from "./helpers";

/**
 * Scenario 8: closing with a cash difference demands an explanation and the
 * difference appears in the final report.
 */
test("scenario 8: close session with cash difference", async ({ page }) => {
  const who = "שחקן הפרש";
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, "בדיקה 8 — הפרש", 2000);
  await addPlayer(page, { newName: who, chips: 500, payMode: "FULL", method: "CASH" });
  await exitPlayer(page, who, true);

  await page.goto(`/sessions/${sessionId}/close`);
  await page.getByTestId("close-next").click(); // players → debts
  await page.getByTestId("close-next").click(); // debts → cash

  // Expected 2,500; count only 2,420 → difference -80 requires explanation.
  await expect(page.getByTestId("close-expected-cash")).toHaveText(ILS(2500));
  await page.fill("#counted-cash", "2420");
  await expect(page.getByTestId("close-difference")).toContainText(`-${ILS(80)}`);

  // The "next" button is blocked until an explanation is entered.
  await expect(page.getByTestId("close-next")).toBeDisabled();
  await page.getByTestId("difference-explanation").fill("חסרים 80 שקלים — עודף שגוי");
  await page.getByTestId("close-next").click();

  await page.getByTestId("close-next").click(); // methods → summary
  await page.getByTestId("close-next").click(); // summary → close
  await page.getByTestId("close-credential").fill("Owner123!");
  await page.getByTestId("close-final").click();
  await page.waitForURL(/\/report$/);

  // The report shows the difference and its explanation.
  await expect(page.getByTestId("report-difference")).toContainText(`-${ILS(80)}`);
  await expect(page.getByText("חסרים 80 שקלים — עודף שגוי")).toBeVisible();

  // Closed session is locked: action buttons are gone / disabled.
  await page.goto(`/sessions/${sessionId}`);
  await expect(page.getByText("הסשן סגור לצפייה בלבד", { exact: false })).toBeVisible();
});
