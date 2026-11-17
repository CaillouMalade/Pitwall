import { _electron } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as browserTest, expect, openPage, selectTrack } from "./fixtures";

// The Electron app with the same synthetic provider answers as the browser tests.
const test = browserTest.extend<{ desktopApp: ElectronApplication }>({
  desktopApp: async ({ browserName: _browserName }, provide) => {
    const directory = await mkdtemp(path.join(tmpdir(), "pitwall-electron-"));
    const application = await _electron.launch({
      args: [process.cwd(), "--pitwall-test"],
      env: {
        ...process.env,
        PITWALL_TEST_PROFILE: path.join(directory, "profile"),
        PITWALL_TEST_PORT: "4175",
        PITWALL_TEST_HOLD: "1",
      },
    });
    try {
      await application.firstWindow();
      await provide(application);
    } finally {
      await application.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  context: async ({ desktopApp }, provide) => {
    await provide(desktopApp.context());
  },
  page: async ({ desktopApp, services: _services }, provide) => {
    const page = await desktopApp.firstWindow();
    await page.clock.setFixedTime(new Date("2026-11-17T09:20:00Z"));
    await provide(page);
  },
});

test("the desktop app loads forecasts, sessions and history", async ({
  page,
  services,
}) => {
  await page.goto("http://localhost:4175/");
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }),
  ).toBeVisible();
  await expect(page.getByText(/^Skipped/)).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Sources" })
      .getByText("12 of 18 answered"),
  ).toBeVisible();
  expect(services.requests).toEqual(
    expect.arrayContaining([
      "api.open-meteo.com",
      "api.met.no",
      "api.brightsky.dev",
    ]),
  );
  await openPage(page, "Session dashboard");
  await expect(page.getByText("9 of 9 agree")).toBeVisible();
  await selectTrack(page, "Monza");
  await openPage(page, "History");
  await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("dialog", { name: "About Pitwall" }).getByText(/^Version /),
  ).toBeVisible();
});
