import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/desktop.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // The longest tests walk through a dozen steps; WebKit needs more than 30 s for them.
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:4174",
    locale: "en-GB",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "webkit",
      // Playwright's WebKit on Windows draws without a graphics card. With the
      // app's animations running it is too slow for the longest tests, so it is
      // tested with "reduce motion" on, which the app honours by stopping them.
      use: { ...devices["Desktop Safari"], reducedMotion: "reduce" },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Separate port and fresh browser contexts protect the real localhost:4173 data.
  webServer: {
    command: "node scripts/start.mjs --port 4174",
    url: "http://localhost:4174/__pitwall_health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
