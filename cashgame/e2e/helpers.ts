import { expect, type Page } from "@playwright/test";

export const ILS = (n: number) => `${n.toLocaleString("en-US")} ₪`;

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/");
}

export async function createSession(page: Page, name: string, openingShekels: number) {
  await page.goto("/sessions/new");
  await page.getByTestId("session-name").fill(name);
  await page.fill("#opening-cash", String(openingShekels));
  await page.getByTestId("create-session").click();
  // Wait for the redirect to the new session page ("new" itself must not match).
  await page.waitForURL(/\/sessions\/(?!new$)[a-z0-9]+$/);
  return page.url().split("/").pop()!;
}

/** Open the add-player dialog (desktop or mobile button, whichever is visible). */
export async function openAddPlayer(page: Page) {
  const visibleButton = page
    .locator('[data-testid="add-player"], [data-testid="add-player-mobile"]')
    .filter({ visible: true })
    .first();
  await visibleButton.click();
}

export interface AddPlayerOptions {
  existingName?: string;
  newName?: string;
  chips?: number; // shekels
  payMode?: "FULL" | "PARTIAL" | "NONE";
  paidNow?: number; // shekels, for PARTIAL
  method?: "CASH" | "BIT" | "BANK_TRANSFER" | "CREDIT_CARD" | "OTHER";
}

export async function addPlayer(page: Page, opts: AddPlayerOptions) {
  await openAddPlayer(page);
  if (opts.existingName) {
    await page.getByTestId("player-search").fill(opts.existingName);
    await page.getByTestId(`pick-player-${opts.existingName}`).click();
  } else if (opts.newName) {
    await page.getByTestId("create-new-player").click();
    await page.getByTestId("new-player-name").fill(opts.newName);
  }
  if (opts.chips == null) {
    // uncheck initial buy-in
    await page.getByText("קנייה ראשונית עכשיו").click();
  } else {
    await page.fill("#ap-chips", String(opts.chips));
    await page.getByTestId(`ap-paymode-${opts.payMode ?? "FULL"}`).click();
    if (opts.payMode === "PARTIAL" && opts.paidNow != null) {
      await page.fill("#ap-paid", String(opts.paidNow));
    }
    if (opts.payMode !== "NONE" && opts.method) {
      await page.selectOption("#ap-method", opts.method);
    }
  }
  await page.getByTestId("add-player-continue").click();
  await page.getByTestId("add-player-confirm").click();
  // Dialog closes on success.
  await expect(page.getByTestId("add-player-confirm")).toBeHidden();
}

export async function cashOut(
  page: Page,
  playerName: string,
  chips: number,
  opts?: { strategy?: "DEBT_FIRST" | "PAY_FULL" | "MANUAL" },
) {
  await page.getByTestId(`action-cashout-${playerName}`).click();
  await page.fill("#cashout-chips", String(chips));
  if (opts?.strategy) {
    await page.selectOption("#cashout-strategy", opts.strategy);
  }
  await page.getByTestId("cashout-continue").click();
  await page.getByTestId("cashout-confirm").click();
  await expect(page.getByTestId("cashout-confirm")).toBeHidden();
}

export async function exitPlayer(page: Page, playerName: string, declareNoChips = false) {
  await page.getByTestId(`action-exit-${playerName}`).click();
  if (declareNoChips) {
    await page.getByTestId("declare-no-chips").check();
  }
  await page.getByTestId("exit-confirm").click();
  await expect(page.getByTestId("exit-confirm")).toBeHidden();
}

/** Walk the closing wizard. Assumes all players already exited. */
export async function closeSession(
  page: Page,
  sessionId: string,
  countedShekels: number,
  opts?: { explanation?: string; credential?: string },
) {
  await page.goto(`/sessions/${sessionId}/close`);
  const next = page.getByTestId("close-next");
  // Step 1 (players) → 2 (debts)
  await expect(next).toBeEnabled();
  await next.click();
  await next.click();
  // Step 3: cash count
  await page.fill("#counted-cash", String(countedShekels));
  if (opts?.explanation) {
    await page.getByTestId("difference-explanation").fill(opts.explanation);
  }
  await expect(next).toBeEnabled();
  await next.click();
  // Step 4: methods → Step 5: summary → Step 6: credential
  await next.click();
  await next.click();
  await page.getByTestId("close-credential").fill(opts?.credential ?? "Owner123!");
  await page.getByTestId("close-final").click();
  await page.waitForURL(/\/report$/);
}

export async function expectSummaryCash(page: Page, shekels: number) {
  await expect(page.getByTestId("summary-expected-cash")).toHaveText(ILS(shekels));
}
