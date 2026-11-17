import { expect, openPage, selectTrack, test } from "./fixtures";

test("weekend overview combines both providers", async ({
  page,
  providers,
}) => {
  await page.goto("/");
  await selectTrack(page, "Monza");
  await expect(
    page.getByRole("heading", { level: 1, name: "Monza" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Wind" })).toBeVisible();
  // Sessions are drawn on the charts and listed in UTC.
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }).getByText("FP1"),
  ).toBeVisible();
  await expect(page.getByText("Wed 18 Nov, 08:00")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rain radar" })).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Radar time" }),
  ).toHaveAttribute("aria-valuetext", "09:20 UTC");
  await expect(page.getByText(/^Skipped/)).toHaveCount(0);
  expect(providers.requests).toContain("api.met.no");
});

test("session dashboard shows combined values, then each provider", async ({
  page,
}) => {
  await page.goto("/");
  await openPage(page, "Session dashboard");
  await expect(page.getByRole("heading", { name: "FP1" })).toBeVisible();
  await expect(page.getByText("1 of 5")).toBeVisible();
  const combined = page.getByRole("region", { name: "Combined" });
  // 225° and 232° are both SW: two votes for one sector.
  await expect(combined.getByText("SW", { exact: true })).toBeVisible();
  await expect(combined.getByText("2 of 2 agree")).toBeVisible();
  await expect(combined.getByText(/^95%: /).first()).toBeVisible();
  const table = page.getByRole("region", { name: "By provider" });
  await expect(
    table.getByRole("rowheader", { name: "Open-Meteo" }),
  ).toBeVisible();
  await expect(
    table.getByRole("rowheader", { name: "MET Norway" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next session" }).click();
  await expect(page.getByRole("heading", { name: "FP2" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous session" }),
  ).toBeEnabled();
});

test("a failing provider is skipped with a warning", async ({
  page,
  providers,
}) => {
  providers.metNorwayStatus = 503;
  await page.goto("/");
  await expect(
    page.getByText(
      "Skipped MET Norway: The weather service has a problem on its side (status 503). Try again later.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }),
  ).toBeVisible();
  await openPage(page, "Session dashboard");
  await expect(
    page
      .getByRole("region", { name: "Combined" })
      .getByText("One provider only: no interval")
      .first(),
  ).toBeVisible();
});

test("adding a track checks it and keeps it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add a track" }).click();
  const form = page.locator("#add-track-form");
  await form.getByLabel("Name").fill("Madrid");
  await form.getByLabel("Latitude").fill("40.4168");
  await form.getByLabel("Longitude").fill("-3.7038");
  await form.getByRole("button", { name: "Add track" }).click();
  await expect(
    form.getByText("No racetrack found at these coordinates."),
  ).toBeVisible();

  await form.getByLabel("Name").fill("monza");
  await form.getByRole("button", { name: "Add track" }).click();
  await expect(
    form.getByText("A track called Monza is already in the list."),
  ).toBeVisible();

  await form.getByLabel("Name").fill("Monza Parabolica");
  await form.getByLabel("Latitude").fill("45.615");
  await form.getByLabel("Longitude").fill("9.29");
  await form.getByRole("button", { name: "Add track" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Monza Parabolica" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Monza Parabolica" }),
  ).toBeVisible();
  await openPage(page, "History");
  await expect(
    page.getByText("Not enough logged history for this track yet."),
  ).toBeVisible();
});

test("history and track comparison use the logged observations", async ({
  page,
}) => {
  await page.goto("/");
  await selectTrack(page, "Monza");
  await openPage(page, "History");
  await expect(
    page.getByRole("region", { name: "Daily rain, mm" }),
  ).toBeVisible();
  await expect(page.getByText("Days logged")).toBeVisible();
  await selectTrack(page, "Red Bull Ring");
  await expect(
    page.getByText("Not enough logged history for this track yet."),
  ).toBeVisible();

  await openPage(page, "Track comparison");
  const chips = page.getByRole("group", { name: /Tracks to compare/ });
  await expect(chips.getByRole("button", { pressed: true })).toHaveCount(2);
  await expect(page.locator(".summary-card")).toHaveCount(2);
  await chips.getByRole("button", { name: "Monza" }).click();
  await chips.getByRole("button", { name: "Imola" }).click();
  await expect(page.locator(".summary-card")).toHaveCount(4);
  // At most 4: the other tracks can't be added.
  await expect(chips.getByRole("button", { name: "Jerez" })).toBeDisabled();
  // Ranked from wettest to driest.
  const totals = await page
    .locator(".summary-card")
    .evaluateAll((cards) =>
      cards.map((card) => parseFloat(card.querySelector("dd")!.textContent!)),
    );
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
});

test("the dark appearance is kept", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
