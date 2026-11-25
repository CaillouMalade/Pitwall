import { expect, test } from "./fixtures";

// The packaged Android app is recognised by the bridge its WebView injects.
// This stand-in lets a browser show the phone layout with the invented forecast.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    const host = window as unknown as Record<string, unknown>;
    host.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };
    // Keeps the answer the same once the plugin runtime loads on demand.
    host.CapacitorCustomPlatform = { name: "android" };
  });
});

test("the phone app has a top bar for the track and tabs along the bottom", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-platform",
    "android",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Red Bull Ring" }),
  ).toBeVisible();
  // The sidebar gives way to the bar; sessions are picked on the pages.
  await expect(page.locator(".sidebar")).toHaveCount(0);

  const tabs = page.getByRole("navigation", { name: "Pages" });
  await page.mouse.wheel(0, 3000);
  await expect(tabs).toBeInViewport();
  for (const name of [
    "Session dashboard",
    "History",
    "Track comparison",
    "Weekend overview",
  ]) {
    await tabs.getByRole("button", { name, exact: true }).click();
    await expect(
      tabs.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // No desktop-width overflow on a phone screen.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  await page.getByLabel("Track", { exact: true }).selectOption({
    label: "Monza",
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "Monza" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the menu reaches what the sidebar offered", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  for (const [item, dialog] of [
    ["Add a track", "Add a track"],
    ["Edit sessions", /sessions|weekend/i],
    ["Settings", "Settings"],
    ["About", /About/],
  ] as const) {
    await menu.click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    const opened = page.getByRole("dialog", { name: dialog });
    await expect(opened).toBeVisible();
    // MET Norway asks mobile apps not to call it directly, so a phone never does.
    if (item === "Settings") {
      await expect(opened.getByLabel("DMI")).toBeVisible();
      await expect(opened.getByLabel("MET Norway")).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await expect(opened).toBeHidden();
  }
  // Escape closes the menu itself too.
  await menu.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("session figures sit two abreast on the session dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: "Session dashboard", exact: true })
    .click();
  const stats = page.locator(".stats").first().locator(".stat");
  await expect(stats.first()).toBeVisible();
  const first = (await stats.nth(0).boundingBox())!;
  const second = (await stats.nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width - 1);
});
