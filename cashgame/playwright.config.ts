import { defineConfig, devices } from "@playwright/test";

const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:cashgame_dev_pw@localhost:5432/cashgame_e2e";
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database → strictly serial execution.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    launchOptions: { executablePath: CHROMIUM },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: CHROMIUM } } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath: CHROMIUM } },
      testMatch: /scenario-(1|2)/,
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB_URL,
      SESSION_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      NODE_ENV: "production",
      CHROMIUM_PATH: CHROMIUM,
    },
  },
});
