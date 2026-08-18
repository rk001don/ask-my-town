import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  // One retry. A failing E2E should be a real failure rather than a flake
  // people learn to ignore, and two retries turned the first (broken) run into
  // a ten-minute gate -- 3 attempts x 30s x 9 tests.
  retries: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // The app is phone-first; testing it at desktop width would miss the
    // layout most customers actually get.
    ...devices["Pixel 7"],
    // Chromium is preinstalled in this environment.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined },
  },
  webServer: {
    command: "npm run dev",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
