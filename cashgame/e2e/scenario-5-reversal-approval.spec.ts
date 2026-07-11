import { test, expect } from "@playwright/test";
import { login, createSession, addPlayer, ILS } from "./helpers";

/**
 * Scenario 5: an operator cannot void a transaction alone — manager approval
 * is required, the original stays visible, the reversal is audited and the
 * totals update.
 */
test("scenario 5: operator reversal requires manager approval", async ({ page, browser }) => {
  // Owner opens a session with a buy-in.
  const who = "שחקן ביטול";
  await login(page, "owner", "Owner123!");
  const sessionId = await createSession(page, "בדיקה 5 — ביטולים", 1000);
  await addPlayer(page, { newName: who, chips: 800, payMode: "FULL", method: "CASH" });
  await expect(page.getByTestId("summary-expected-cash")).toHaveText(ILS(1800));

  // Operator signs in from a separate browser context.
  const opCtx = await browser.newContext();
  const op = await opCtx.newPage();
  await login(op, "operator", "Operator123!");
  await op.goto(`/sessions/${sessionId}`);

  // Open player history and attempt a reversal.
  await op.getByTestId(`action-history-${who}`).click();
  await op.locator('[data-testid^="reverse-"]').first().click();
  await op.getByTestId("reversal-reason").fill("סכום שגוי");
  await op.getByTestId("reversal-confirm").click();

  // Server demands manager approval → inline approval fields appear.
  await expect(op.getByText("נדרש אישור מנהל").first()).toBeVisible();
  await op.fill("#approval-username", "manager");
  await op.fill("#approval-secret", "2345");
  await op.getByTestId("reversal-confirm").click();
  await expect(op.getByTestId("reversal-confirm")).toBeHidden();

  // Close the history dialog to get back to the dashboard.
  await op.keyboard.press("Escape");

  // Totals updated: the whole buy-in batch (chips+payment) was voided.
  await expect(op.getByTestId("summary-expected-cash")).toHaveText(ILS(1000));

  // Original transaction remains visible, marked as reversed.
  await op.getByTestId(`action-history-${who}`).click();
  await expect(op.getByTestId("tx-SESSION_BUY_IN-REVERSED")).toBeVisible();
  await expect(op.getByTestId("tx-REVERSAL-ACTIVE").first()).toBeVisible();
  await opCtx.close();

  // The reversal appears in the audit log (owner).
  await page.goto("/audit");
  await expect(page.getByTestId("audit-REVERSAL").first()).toBeVisible();
});
