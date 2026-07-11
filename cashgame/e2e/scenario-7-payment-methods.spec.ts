import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, ILS } from "./helpers";

/**
 * Scenario 7: only CASH payments move the physical drawer; BIT is tracked
 * separately.
 */
test("scenario 7: cash vs bit drawer separation", async ({ page }) => {
  await login(page, "owner", "Owner123!");
  await createSession(page, "בדיקה 7 — אמצעי תשלום", 1000);

  await addPlayer(page, { newName: "משלם מזומן", chips: 400, payMode: "FULL", method: "CASH" });
  await addPlayer(page, { newName: "משלם ביט", chips: 600, payMode: "FULL", method: "BIT" });

  // Expected cash: 1,000 + 400 (cash only). BIT does not move the drawer.
  await expect(page.getByTestId("summary-expected-cash")).toHaveText(ILS(1400));

  // Drawer dialog: bit shown separately as a non-cash receipt.
  await page.getByTestId("open-drawer").click();
  await expect(page.getByTestId("drawer-expected")).toHaveText(ILS(1400));
  await expect(page.getByText(`ביט: ${ILS(600)}`)).toBeVisible();
});
