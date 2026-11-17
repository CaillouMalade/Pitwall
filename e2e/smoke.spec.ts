import { expect, openPage, selectTrack, test } from "./fixtures";

// The invented forecast (see fixtures.ts): 12 sources from 9 centres answer for
// Red Bull Ring, the first track, and they disagree about rain on the first
// afternoon of the weekend. GeoSphere Austria, off by default, adds one more.

test.describe("first launch", () => {
  test.use({ firstRun: true });

  test("set-up asks for a track and units, once", async ({ page }) => {
    await page.goto("/");
    const setup = page.getByRole("dialog", { name: "Set up Pitwall" });
    await expect(setup).toBeVisible();
    await setup.getByLabel("Track").selectOption({ label: "Monza, Italy" });
    await setup.getByRole("radio", { name: "°F" }).click();
    await setup.getByRole("radio", { name: "mph" }).click();
    await setup.getByRole("button", { name: "Continue" }).click();
    await expect(setup).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Monza" }),
    ).toBeVisible();
    await expect(page.getByText("Temperature, °F")).toBeVisible();
    await expect(page.getByText("Wind, mph")).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Monza" }),
    ).toBeVisible();
    await expect(page.getByText("Temperature, °F")).toBeVisible();
    await expect(setup).toBeHidden();
  });
});

test("weekend overview combines every source that answers", async ({
  page,
  services,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Red Bull Ring" }),
  ).toBeVisible();
  const weather = page.getByRole("region", { name: "Rain and temperature" });
  await expect(weather).toBeVisible();
  await expect(weather.getByText("80% range").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Wind" })).toBeVisible();
  // Sessions are drawn on the charts and listed in UTC.
  await expect(weather.getByText("FP1")).toBeVisible();
  await expect(page.getByText("Wed 18 Nov, 08:00")).toBeVisible();

  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByText("12 of 18 answered")).toBeVisible();
  await expect(sources.locator(".source.answered")).toHaveCount(12);
  // The regional models and the services for other regions have nothing here.
  await expect(sources.locator(".source.none")).toHaveCount(6);
  await expect(
    sources.getByTitle("SMHI: nothing for this place"),
  ).toBeVisible();
  await expect(page.getByText(/^Skipped/)).toHaveCount(0);

  await expect(page.getByRole("region", { name: "Rain radar" })).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Radar time" }),
  ).toHaveAttribute("aria-valuetext", "09:20 UTC");
  // Services that do not cover Austria are not asked at all.
  expect(services.requests).toEqual(
    expect.arrayContaining([
      "api.open-meteo.com",
      "api.met.no",
      "api.brightsky.dev",
      "opendataapi.dmi.dk",
    ]),
  );
  // Nor is a service that is turned off.
  for (const host of [
    "dataset.api.hub.geosphere.at",
    "api.weather.gov",
    "opendata-download-metfcst.smhi.se",
    "opendata.fmi.fi",
  ])
    expect(services.requests).not.toContain(host);
});

test("session dashboard: combined answer, then each source", async ({
  page,
}) => {
  await page.goto("/");
  await openPage(page, "Session dashboard");
  await expect(page.getByRole("heading", { name: "FP1" })).toBeVisible();
  await expect(page.getByText("1 of 5")).toBeVisible();
  const combined = page.getByRole("region", { name: "Combined" });
  await expect(combined.getByText("Window 06:00–09:00 UTC")).toBeVisible();
  await expect(combined.getByText(/^80% range: /).first()).toBeVisible();
  // Every centre says south-west: one vote each, however many feeds it has.
  await expect(combined.getByText("SW", { exact: true })).toBeVisible();
  await expect(combined.getByText("9 of 9 agree")).toBeVisible();
  await expect(combined.getByText("0 of 9 expect ≥ 0.5 mm")).toBeVisible();
  await expect(combined.getByText("12 sources from 9 centres")).toBeVisible();

  const table = page.getByRole("region", { name: "By source" });
  for (const source of [
    "ECMWF IFS",
    "MET Norway",
    "DWD MOSMIX",
    "DMI Harmonie",
  ])
    await expect(table.getByRole("rowheader", { name: source })).toBeVisible();
  // The centre column shows which sources count together: ECMWF's two models
  // and MET Norway, whose forecast here is built on ECMWF's.
  await expect(
    table.getByRole("cell", { name: "ECMWF", exact: true }),
  ).toHaveCount(3);
  await expect(table.getByRole("cell", { name: "9 centres" })).toBeVisible();

  // FP2 is in the wet spell: the centres disagree, and the page says how many.
  await page.getByRole("button", { name: "Next session" }).click();
  await expect(page.getByRole("heading", { name: "FP2" })).toBeVisible();
  await expect(combined.getByText("5 of 9 expect ≥ 0.5 mm")).toBeVisible();
  await expect(combined.getByText("0.6 mm")).toBeVisible();
  await expect(combined.getByText(/chance of rain/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous session" }),
  ).toBeEnabled();

  // A session in the sidebar opens its dashboard.
  await page
    .getByRole("list", { name: "Sessions" })
    .getByRole("button", { name: /Race/ })
    .click();
  await expect(page.getByRole("heading", { name: "Race" })).toBeVisible();
  await expect(page.getByText("5 of 5")).toBeVisible();
});

test("a failing service is skipped with a warning", async ({
  page,
  services,
}) => {
  services.down.add("api.met.no");
  await page.goto("/");
  await expect(
    page.getByText(
      "Skipped MET Norway: The weather service has a problem on its side (status 503). Try again later.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }),
  ).toBeVisible();
  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByText("11 of 18 answered")).toBeVisible();
  await expect(sources.locator(".source.failed")).toHaveCount(1);
  await openPage(page, "Session dashboard");
  await expect(
    page
      .getByRole("region", { name: "Combined" })
      .getByText("11 sources from 9 centres"),
  ).toBeVisible();
});

test("with one service left, the page says so instead of drawing a range", async ({
  page,
  services,
}) => {
  for (const host of [
    "api.open-meteo.com",
    "api.brightsky.dev",
    "opendataapi.dmi.dk",
  ])
    services.down.add(host);
  await page.goto("/");
  await expect(page.getByText(/^Skipped/)).toHaveCount(3);
  await openPage(page, "Session dashboard");
  const combined = page.getByRole("region", { name: "Combined" });
  await expect(combined.getByText("One source").first()).toBeVisible();
  await expect(combined.getByText("1 source", { exact: true })).toBeVisible();
  await expect(combined.getByText(/80% range/)).toHaveCount(0);
});

test("a track anywhere: add, keep, edit and delete", async ({
  page,
  services,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add a track" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a track" });
  const add = dialog.getByRole("button", { name: "Add track" });

  await add.click();
  await expect(
    dialog.getByText("Please enter a name for the track."),
  ).toBeVisible();
  await dialog.getByLabel("Name").fill("monza");
  await add.click();
  await expect(
    dialog.getByText("A track called Monza is already in the list."),
  ).toBeVisible();
  await dialog.getByLabel("Name").fill("Sebring");
  await dialog.getByLabel("Latitude").fill("north");
  await add.click();
  await expect(
    dialog.getByText("Latitude must be a number, for example 50.43."),
  ).toBeVisible();
  await dialog.getByLabel("Latitude").fill("27.4547");
  await dialog.getByLabel("Longitude").fill("-281.3483");
  await add.click();
  await expect(
    dialog.getByText("Longitude must be between -180 and 180."),
  ).toBeVisible();

  // Florida: thousands of kilometres from any of the built-in circuits.
  await dialog.getByLabel("Longitude").fill("-81.3483");
  await add.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sebring" }),
  ).toBeVisible();
  await expect(page.getByText("27.4547° N, 81.3483° W")).toBeVisible();
  // In the United States the National Weather Service answers too.
  const sources = page.getByRole("region", { name: "Sources" });
  await expect(
    sources.getByTitle("US National Weather Service: answered"),
  ).toBeVisible();
  expect(services.requests).toContain("api.weather.gov");

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sebring" }),
  ).toBeVisible();
  // History works for a track the user added.
  await openPage(page, "History");
  await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Daily rain, mm" }),
  ).toBeVisible();

  // Edit: a new name, kept.
  await page.getByRole("button", { name: "Edit Sebring" }).click();
  const edit = page.getByRole("dialog", { name: "Edit track" });
  await expect(edit.getByLabel("Latitude")).toHaveValue("27.4547");
  await edit.getByLabel("Name").fill("Sebring Raceway");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sebring Raceway" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sebring Raceway" }),
  ).toBeVisible();

  // Delete asks once more, then the track is gone.
  await page.getByRole("button", { name: "Edit Sebring Raceway" }).click();
  await edit.getByRole("button", { name: "Delete", exact: true }).click();
  await edit.getByRole("button", { name: "Delete Sebring Raceway" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Red Bull Ring" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Sebring Raceway")).toHaveCount(0);
  // The built-in circuits cannot be edited.
  await expect(
    page.getByRole("button", { name: /^Edit Red Bull/ }),
  ).toHaveCount(0);
});

test("each track has its own weekend", async ({ page }) => {
  await page.goto("/");
  await selectTrack(page, "Monza");
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const dialog = page.getByRole("dialog", { name: "Weekend at Monza" });
  await dialog.getByLabel("First day").fill("2026-11-19");
  // Days are now named: the race moves to the Friday afternoon.
  await dialog.getByLabel("Session 5 time").fill("15:30");
  await dialog.getByLabel("Session 1 name").fill("Shakedown");
  await dialog.getByRole("button", { name: "Remove FP3" }).click();
  await dialog.getByRole("button", { name: "Add session" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Every session needs a name.")).toBeVisible();
  await dialog.getByLabel("Session 5 name").fill("Warm-up");
  await dialog
    .getByLabel("Session 5 day")
    .selectOption({ label: "Sat 21 Nov" });
  await dialog.getByLabel("Session 5 time").fill("08:15");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const sessions = page.getByRole("list", { name: "Sessions" });
  await expect(sessions.getByRole("button")).toHaveText([
    /Shakedown.*Thu 19 Nov, 08:00/,
    /FP2.*Thu 19 Nov, 14:00/,
    /Qualifying.*Fri 20 Nov, 14:00/,
    /Warm-up.*Sat 21 Nov, 08:15/,
    /Race.*Sat 21 Nov, 15:30/,
  ]);
  // The charts follow the weekend's own days.
  await expect(
    page
      .getByRole("region", { name: "Rain and temperature" })
      .getByText("Shakedown"),
  ).toBeVisible();

  // Another track still has the default weekend; Monza keeps its own after a reload.
  await selectTrack(page, "Imola");
  await expect(sessions.getByRole("button").first()).toHaveText(
    /FP1.*Wed 18 Nov, 08:00/,
  );
  await page.reload();
  await selectTrack(page, "Monza");
  await expect(sessions.getByRole("button").first()).toHaveText(
    /Shakedown.*Thu 19 Nov, 08:00/,
  );

  await page.getByRole("button", { name: "Edit sessions" }).click();
  await dialog.getByRole("button", { name: "Reset to default" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(sessions.getByRole("button").first()).toHaveText(
    /FP1.*Wed 18 Nov, 08:00/,
  );
});

test("a weekend out of reach says so", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const dialog = page.getByRole("dialog", { name: /Weekend at/ });
  await dialog.getByLabel("First day").fill("2027-03-19");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("No forecast reaches this weekend yet."),
  ).toBeVisible();
  await openPage(page, "Session dashboard");
  await expect(
    page.getByText("No forecast reaches this session yet."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit sessions" }).click();
  await dialog.getByLabel("First day").fill("2026-11-10");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("This session is over.")).toBeVisible();
  await openPage(page, "Weekend overview");
  await expect(page.getByText("This weekend is over.")).toBeVisible();
});

test("units and services are settings, and they are kept", async ({ page }) => {
  await page.goto("/");
  await openPage(page, "Session dashboard");
  const combined = page.getByRole("region", { name: "Combined" });
  await expect(combined.getByText(/°C$/).first()).toBeVisible();
  await expect(combined.getByText(/km\/h$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("radio", { name: "°F" }).click();
  await settings.getByRole("radio", { name: "m/s" }).click();
  // GeoSphere Austria is off until it is turned on; DMI is turned off here.
  await expect(settings.getByLabel("GeoSphere Austria")).not.toBeChecked();
  await settings.getByLabel("GeoSphere Austria").check();
  await settings.getByLabel("DMI").uncheck();
  await settings.getByRole("button", { name: "Close" }).click();
  await expect(combined.getByText(/°F$/).first()).toBeVisible();
  await expect(combined.getByText(/m\/s$/).first()).toBeVisible();
  await expect(combined.getByText("12 sources from 9 centres")).toBeVisible();
  const table = page.getByRole("region", { name: "By source" });
  await expect(
    table.getByRole("rowheader", { name: "GeoSphere Austria" }),
  ).toBeVisible();
  await expect(
    table.getByRole("rowheader", { name: "DMI Harmonie" }),
  ).toHaveCount(0);

  await page.reload();
  await openPage(page, "Session dashboard");
  await expect(combined.getByText(/°F$/).first()).toBeVisible();
  await expect(combined.getByText("12 sources from 9 centres")).toBeVisible();
  await openPage(page, "History");
  await expect(
    page.getByRole("region", { name: "Daily temperature, °F" }),
  ).toBeVisible();
});

test("history comes from the archive, for the chosen period", async ({
  page,
  services,
}) => {
  await page.goto("/");
  await openPage(page, "History");
  const summary = page.getByRole("region", { name: "Summary" });
  // 30 days ending yesterday, 16 November.
  await expect(summary.getByText("18 Oct – 16 Nov")).toBeVisible();
  // Every fifth day is wet in the invented archive: 6 of 30.
  await expect(summary.getByText("Rain days")).toBeVisible();
  await expect(summary.getByText("6", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Daily rain, mm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^Strongest wind of the day/ }),
  ).toBeVisible();
  await expect(page.getByText(/reanalysis/)).toBeVisible();

  await page.getByRole("radio", { name: "14 days" }).click();
  await expect(summary.getByText("3 Nov – 16 Nov")).toBeVisible();
  expect(services.requests).toContain("archive-api.open-meteo.com");
});

test("without the archive, history falls back on the bundled log", async ({
  page,
  services,
}) => {
  services.down.add("archive-api.open-meteo.com");
  await page.goto("/");
  await selectTrack(page, "Monza");
  await openPage(page, "History");
  await expect(
    page.getByText(
      "The weather archive cannot be reached. Showing the log that comes with Pitwall.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Summary" }).getByText("29 Oct – 13 Nov"),
  ).toBeVisible();
  await expect(page.getByText(/OpenWeather/)).toBeVisible();
  // Red Bull Ring has a single reading in the log: not enough to draw.
  await selectTrack(page, "Red Bull Ring");
  await expect(
    page.getByText(
      "The weather service has a problem on its side (status 503). Try again later.",
    ),
  ).toBeVisible();
});

test("track comparison uses the same tracks as the sidebar", async ({
  page,
  services,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "pitwall-tracks",
      JSON.stringify([
        {
          id: "sebring",
          name: "Sebring",
          country: "",
          latitude: 27.4547,
          longitude: -81.3483,
        },
      ]),
    ),
  );
  await page.goto("/");
  await openPage(page, "Track comparison");
  const chips = page.getByRole("group", { name: /Tracks to compare/ });
  // The 16 built-in circuits and the user's own track, in the sidebar's order.
  await expect(chips.getByRole("button")).toHaveCount(17);
  await expect(chips.getByRole("button").first()).toHaveText("Red Bull Ring");
  await expect(chips.getByRole("button").last()).toHaveText("Sebring");
  await expect(chips.getByRole("button", { name: "Nogaro" })).toHaveCount(0);
  // It starts with the track being looked at and the next one.
  await expect(chips.getByRole("button", { pressed: true })).toHaveText([
    "Red Bull Ring",
    "Spa-Francorchamps",
  ]);
  await expect(page.locator(".summary-card")).toHaveCount(2);

  await chips.getByRole("button", { name: "Zandvoort" }).click();
  await chips.getByRole("button", { name: "Sebring" }).click();
  await expect(page.locator(".summary-card")).toHaveCount(4);
  // At most 4: the other tracks can't be added.
  await expect(chips.getByRole("button", { name: "Jerez" })).toBeDisabled();
  // Ranked from wettest to driest: the invented archive is wetter further north.
  await expect(page.locator(".summary-card h2")).toHaveText([
    "Zandvoort",
    "Spa-Francorchamps",
    "Red Bull Ring",
    "Sebring",
  ]);
  const totals = await page
    .locator(".summary-card")
    .evaluateAll((cards) =>
      cards.map((card) => parseFloat(card.querySelector("dd")!.textContent!)),
    );
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
  await expect(page.getByText("18 Oct – 16 Nov, wettest first")).toBeVisible();

  // With one track left there is nothing to compare.
  for (const name of ["Zandvoort", "Sebring", "Spa-Francorchamps"])
    await chips.getByRole("button", { name }).click();
  await expect(
    page.getByText("Pick at least two tracks to compare."),
  ).toBeVisible();

  // A track without history is named and left out; the others still compare.
  services.down.add("archive-api.open-meteo.com");
  await page.getByRole("radio", { name: "14 days" }).click();
  for (const name of ["Monza", "Imola"])
    await chips.getByRole("button", { name }).click();
  await expect(page.getByText("No history for Red Bull Ring.")).toBeVisible();
  await expect(page.locator(".summary-card")).toHaveCount(2);
  await expect(
    page.getByText(/Showing the log that comes with Pitwall/),
  ).toBeVisible();
});

test("offline: the last forecast is shown, and says how old it is", async ({
  page,
  services,
  context,
}) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("region", { name: "Sources" })
      .getByText("12 of 18 answered"),
  ).toBeVisible();

  services.offline = true;
  await context.setOffline(true);
  await page.getByRole("button", { name: "Refresh forecasts" }).click();
  await expect(
    page.getByText("Offline. Showing the forecast from Tue 17 Nov, 09:20 UTC."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rain and temperature" }),
  ).toBeVisible();
  await openPage(page, "Session dashboard");
  await expect(
    page.getByRole("region", { name: "Combined" }).getByText("9 of 9 agree"),
  ).toBeVisible();

  // A track never opened has nothing saved.
  await openPage(page, "Weekend overview");
  // Hockenheimring: never opened here, and with too little in the bundled log.
  await selectTrack(page, "Hockenheimring");
  await expect(
    page.getByText("Offline. No forecast is saved for this track yet."),
  ).toBeVisible();
  await openPage(page, "History");
  await expect(
    page.getByText("Offline. History needs a connection for this track."),
  ).toBeVisible();

  // Back online, the forecast loads again without being asked.
  await openPage(page, "Weekend overview");
  services.offline = false;
  await context.setOffline(false);
  await expect(
    page.getByRole("region", { name: "Sources" }).getByText(/of 18 answered/),
  ).toBeVisible();
  await expect(page.getByText(/^Offline/)).toHaveCount(0);
});

test("the appearance is a setting, and it is kept", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings" }).click();
  await settings.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Escape closes a dialog.
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});

test("about shows the version, the credits and the privacy line", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "About" }).click();
  const about = page.getByRole("dialog", { name: "About Pitwall" });
  await expect(about.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  await expect(about.getByText(/Pitwall collects nothing/)).toBeVisible();
  for (const name of [
    "Open-Meteo",
    "MET Norway",
    "Deutscher Wetterdienst",
    "RainViewer",
    "OpenStreetMap",
  ])
    await expect(about.getByRole("link", { name })).toBeVisible();
  await expect(
    about.getByRole("link", { name: "Open-source licences" }),
  ).toHaveAttribute("href", "/THIRD_PARTY_NOTICES.txt");
  await about.getByRole("button", { name: "Close" }).click();
  await expect(about).toBeHidden();
});

test("the circuit view switches between satellite and map", async ({
  page,
}) => {
  await page.goto("/");
  const circuit = page.getByRole("region", { name: "Circuit" });
  await expect(
    circuit.getByRole("img", { name: "Satellite view of Red Bull Ring" }),
  ).toBeVisible();
  await expect(circuit.getByText(/Sentinel-2 cloudless/)).toBeVisible();
  await circuit.getByRole("radio", { name: "Map" }).click();
  await expect(
    circuit.getByRole("img", { name: "Map of Red Bull Ring" }),
  ).toBeVisible();
  await expect(circuit.getByText(/OpenStreetMap/)).toBeVisible();
});
