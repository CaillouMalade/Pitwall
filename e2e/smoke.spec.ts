import { expect, openPage, selectTrack, test } from "./fixtures";

// The invented forecast (see fixtures.ts): 12 sources from 9 centres answer for
// Red Bull Ring, the first track, and they disagree about rain on the first
// afternoon of the weekend. GeoSphere Austria, off by default, adds one more.
// The clock stands at 17 November 2026, 09:20 UTC: 10:20 at the track.

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
  await expect(
    weather.getByText("Range between forecasts").first(),
  ).toBeVisible();
  await expect(weather.getByText("Rain, mm per hour")).toBeVisible();
  await expect(page.getByRole("region", { name: "Wind" })).toBeVisible();
  // Sessions are drawn on the charts and listed in the track's own time.
  await expect(weather.getByText("FP1").first()).toBeVisible();
  await expect(page.getByText(/times in CET/)).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Sessions", exact: true })
      .getByText("Wed 18 Nov, 08:00"),
  ).toBeVisible();

  // The circuit's layout, drawn from its outline.
  const circuit = page.getByRole("region", { name: "Circuit" });
  await expect(
    circuit.getByRole("img", { name: "Layout of Red Bull Ring" }),
  ).toBeVisible();
  await expect(circuit.getByText("4.30 km")).toBeVisible();
  await expect(circuit.getByText("Clockwise")).toBeVisible();

  // Each session at a glance: FP2 is in the wet spell, FP1 is not.
  const tiles = page.getByRole("list", { name: "Sessions at a glance" });
  await expect(tiles.getByRole("button")).toHaveCount(5);
  await expect(
    tiles.getByRole("button", { name: /FP1/ }).getByText("0 of 9 expect rain"),
  ).toBeVisible();
  await expect(
    tiles.getByRole("button", { name: /FP2/ }).getByText("5 of 9 expect rain"),
  ).toBeVisible();

  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByText("12 of 18 answered")).toBeVisible();
  await expect(sources.locator(".source.answered")).toHaveCount(12);
  // The regional models and the services for other regions have nothing here.
  await expect(sources.locator(".source.none")).toHaveCount(6);
  await expect(
    sources.getByTitle("SMHI: nothing for this place"),
  ).toBeVisible();
  await expect(page.getByText(/^Skipped/)).toHaveCount(0);

  // The rain radar is on the Session dashboard, not here.
  await expect(page.getByRole("region", { name: /radar/i })).toHaveCount(0);
  // Services that do not cover Austria are not asked at all.
  expect(services.requests).toEqual(
    expect.arrayContaining([
      "api.open-meteo.com",
      "api.met.no",
      "api.brightsky.dev",
      "opendataapi.dmi.dk",
    ]),
  );
  // Nor is a service that is turned off, or the outline of a built-in circuit.
  for (const host of [
    "dataset.api.hub.geosphere.at",
    "api.weather.gov",
    "opendata-download-metfcst.smhi.se",
    "opendata.fmi.fi",
    "overpass-api.de",
  ])
    expect(services.requests).not.toContain(host);
});

test("a session tile opens that session", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("list", { name: "Sessions at a glance" })
    .getByRole("button", { name: /Qualifying/ })
    .click();
  await expect(page.getByRole("tab", { name: /Qualifying/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a tooltip shows on the chart under the pointer only", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "There is no pointer to hover with on a phone.");
  await page.goto("/");
  const weather = page.getByRole("region", { name: "Rain and temperature" });
  await weather.getByRole("img", { name: /^Temperature/ }).hover();
  await expect(page.locator(".tooltip")).toHaveCount(1);
  await expect(page.locator(".tooltip")).toContainText("Temperature");
  await page
    .getByRole("region", { name: "Wind" })
    .getByRole("img", { name: /^Wind/ })
    .hover();
  await expect(page.locator(".tooltip")).toHaveCount(1);
  await expect(page.locator(".tooltip")).toContainText("From");
});

test("the track list folds away, and stays as it was left", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "A phone has a plain select instead of the list.");
  await page.goto("/");
  const list = page.getByRole("list", { name: "Tracks" });
  await expect(list).toBeHidden();
  const toggle = page.getByRole("button", { name: /Red Bull Ring\. / });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(list.getByRole("button")).toHaveCount(16);
  await list.getByRole("button", { name: "Monza" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Monza" }),
  ).toBeVisible();
  // Open stays open over a reload; closing it is kept too.
  await page.reload();
  await expect(list).toBeVisible();
  await page
    .getByRole("button", { name: /Monza\. Hide the track list/ })
    .click();
  await expect(list).toBeHidden();
  await page.reload();
  await expect(list).toBeHidden();
});

test("session dashboard: verdict, maps, charts, then each source", async ({
  page,
}) => {
  await page.goto("/");
  await openPage(page, "Session dashboard");
  await expect(page.getByRole("tab", { name: /FP1/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText(/FP1 · Wed 18 Nov, 08:00–09:00 · 1 h · in 21 h/),
  ).toBeVisible();
  const combined = page.getByRole("region", { name: "Combined" });
  await expect(
    combined.getByText("Dry: none of the 9 forecasting centres expects rain."),
  ).toBeVisible();
  await expect(combined.getByText(/^80% range: /).first()).toBeVisible();
  // Every centre says south-west: one vote each, however many feeds it has.
  await expect(combined.getByText("SW", { exact: true })).toBeVisible();
  await expect(combined.getByText("9 of 9 agree")).toBeVisible();
  await expect(combined.getByText("0 of 9 expect rain").first()).toBeVisible();
  await expect(combined.getByText(/12 sources from 9 centres/)).toBeVisible();
  await expect(combined.getByText("Forecasts agree")).toBeVisible();

  // The maps: forecast rain and the wind on the circuit, both on the timeline.
  const rain = page.getByRole("region", { name: "Rain around the circuit" });
  await expect(
    rain.getByRole("img", { name: "Forecast rain around Red Bull Ring" }),
  ).toBeVisible();
  await expect(rain.getByText("Forecast · 08:00")).toBeVisible();
  const wind = page.getByRole("region", { name: "Wind on the circuit" });
  await expect(
    wind.getByRole("img", { name: /^Wind over Red Bull Ring/ }),
  ).toBeVisible();
  await expect(wind.getByText("9 of 9 agree")).toBeVisible();
  await expect(wind.getByText("Headwind", { exact: true })).toBeVisible();
  const timeline = page.getByRole("slider", { name: "Time shown on the maps" });
  await expect(timeline).toHaveAttribute("aria-valuetext", "08:00");
  await timeline.focus();
  await page.keyboard.press("ArrowRight");
  await expect(timeline).toHaveAttribute("aria-valuetext", "08:15");
  await expect(rain.getByText("Forecast · 08:15")).toBeVisible();
  // Playing moves it on by itself.
  await page.getByRole("button", { name: "Play" }).click();
  await expect(timeline).not.toHaveAttribute("aria-valuetext", "08:15");
  await page.getByRole("button", { name: "Pause" }).click();

  // Radar is what was measured: the last two hours, with its own slider.
  await rain.getByRole("radio", { name: "Radar" }).click();
  await expect(
    rain.getByRole("img", { name: "Rain radar around Red Bull Ring" }),
  ).toBeVisible();
  await expect(
    rain.getByRole("slider", { name: "Radar time" }),
  ).toHaveAttribute("aria-valuetext", "10:20");
  await expect(rain.getByText("Measured · 10:20")).toBeVisible();

  // The same charts as the overview, around the session, and rain by the quarter hour.
  const charts = page.getByRole("region", {
    name: "Rain and temperature around the session",
  });
  await expect(charts.getByText("Rain, mm per hour")).toBeVisible();
  await expect(charts.getByText("Rain, mm per 15 minutes")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Wind around the session" }),
  ).toBeVisible();
  const spread = page.getByRole("region", {
    name: "How far the forecasts are apart",
  });
  await expect(spread.locator(".spread-dot")).toHaveCount(27);

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
  await expect(page.getByRole("tab", { name: /FP2/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    combined.getByText("Could go either way: 5 of 9 centres expect rain."),
  ).toBeVisible();
  await expect(combined.getByText("0.3 mm").first()).toBeVisible();
  await expect(combined.getByText("Forecasts disagree")).toBeVisible();
  await expect(combined.getByText(/chance of rain/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous session" }),
  ).toBeEnabled();

  // A session in the sidebar opens its dashboard.
  await page
    .getByRole("list", { name: "Sessions", exact: true })
    .getByRole("button", { name: /Race/ })
    .click();
  await expect(page.getByRole("tab", { name: /Race/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The race lasts two hours, and a session's rain is its total.
  await expect(
    page.getByText(/Race · Fri 20 Nov, 13:00–15:00 · 2 h/),
  ).toBeVisible();
  await expect(
    combined.getByText(/the whole session \(2 hours\)/),
  ).toBeVisible();
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
      .getByText(/11 sources from 9 centres/),
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
  await expect(combined.getByText(/^1 source · /)).toBeVisible();
  await expect(combined.getByText("Too few forecasts")).toBeVisible();
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
  await expect(page.locator(".subtitle")).toContainText(
    "27.4547° N, 81.3483° W",
  );
  // Its time zone is looked up.
  await expect(
    page.getByRole("heading", { name: /^Sessions GMT-5/ }),
  ).toBeVisible();
  // Its outline comes from OpenStreetMap, but only when asked for.
  const outline = page.getByRole("region", { name: "Circuit" });
  await expect(
    outline.getByText("There is no outline for this track yet."),
  ).toBeVisible();
  expect(services.requests).not.toContain("overpass-api.de");
  await outline
    .getByRole("button", { name: "Get the outline from OpenStreetMap" })
    .click();
  await expect(
    outline.getByText("Racetrack lines from OpenStreetMap near this place"),
  ).toBeVisible();
  await expect(
    outline.getByRole("img", { name: "Layout of Sebring" }),
  ).toBeVisible();
  expect(
    services.requests.filter((host) => host === "overpass-api.de"),
  ).toHaveLength(1);
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
  // The outline is kept: it is drawn again without asking.
  await expect(
    outline.getByRole("img", { name: "Layout of Sebring" }),
  ).toBeVisible();
  expect(
    services.requests.filter((host) => host === "overpass-api.de"),
  ).toHaveLength(1);
  // History works for a track the user added.
  await openPage(page, "History");
  await expect(
    page.getByRole("region", { name: "Year by year" }),
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
  await expect(dialog.getByText(/in the track's time \(CET\)/)).toBeVisible();
  await dialog.getByLabel("First day").fill("2026-11-19");
  // Days are now named: the race moves to the Friday afternoon.
  await dialog.getByLabel("Session 5 start").fill("15:30");
  await dialog.getByLabel("Session 5 length in minutes").fill("90");
  await dialog.getByLabel("Session 1 name").fill("Shakedown");
  await dialog.getByRole("button", { name: "Remove FP3" }).click();
  await dialog.getByRole("button", { name: "Add session" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText("Every session needs a name.")).toBeVisible();
  await dialog.getByLabel("Session 5 name").fill("Warm-up");
  await dialog
    .getByLabel("Session 5 day")
    .selectOption({ label: "Sat 21 Nov" });
  await dialog.getByLabel("Session 5 start").fill("08:15");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  const sessions = page.getByRole("list", { name: "Sessions", exact: true });
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
  // The race is as long as it was made.
  await sessions.getByRole("button", { name: /Race/ }).click();
  await expect(
    page.getByText(/Race · Sat 21 Nov, 15:30–17:00 · 1 h 30/),
  ).toBeVisible();
  await openPage(page, "Weekend overview");

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
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sessions.getByRole("button").first()).toHaveText(
    /FP1.*Wed 18 Nov, 08:00/,
  );
});

test("a weekend type is saved, reused and made the default", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const dialog = page.getByRole("dialog", { name: "Weekend at Red Bull Ring" });
  const type = dialog.getByRole("combobox", { name: "Weekend type" });
  await expect(type).toHaveValue("standard");
  // A test day: two sessions.
  for (const name of ["FP3", "Qualifying", "Race"])
    await dialog.getByRole("button", { name: `Remove ${name}` }).click();
  await dialog.getByLabel("Session 1 name").fill("Morning");
  await dialog.getByLabel("Session 2 name").fill("Afternoon");
  await dialog.getByLabel("Session 2 length in minutes").fill("180");
  await expect(type).toHaveValue("");
  await dialog.getByRole("button", { name: "Save as a type…" }).click();
  await dialog.getByRole("button", { name: "Save type" }).click();
  await expect(dialog.getByText("Give the weekend type a name.")).toBeVisible();
  await dialog.getByLabel("Name of the new weekend type").fill("Test day");
  await dialog.getByRole("button", { name: "Save type" }).click();
  await expect(dialog.getByText('Saved as "Test day".')).toBeVisible();
  await expect(type.locator("option:checked")).toHaveText("Test day");
  await dialog.getByRole("button", { name: "Set as default" }).click();
  await expect(
    dialog.getByText('"Test day" is now the default.'),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  // Every track without a weekend of its own now has the test day.
  const sessions = page.getByRole("list", { name: "Sessions", exact: true });
  await expect(sessions.getByRole("button")).toHaveText([
    /Morning/,
    /Afternoon/,
  ]);
  await selectTrack(page, "Jerez");
  await expect(sessions.getByRole("button")).toHaveText([
    /Morning/,
    /Afternoon/,
  ]);
  await page.reload();
  await expect(sessions.getByRole("button")).toHaveCount(2);

  // The standard weekend is still there to pick, for one track.
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const jerez = page.getByRole("dialog", { name: "Weekend at Jerez" });
  await jerez
    .getByRole("combobox", { name: "Weekend type" })
    .selectOption({ label: "Standard weekend" });
  await jerez.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sessions.getByRole("button")).toHaveCount(5);
  await selectTrack(page, "Imola");
  await expect(sessions.getByRole("button")).toHaveCount(2);

  // Deleting the type puts the standard weekend back as the default.
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const imola = page.getByRole("dialog", { name: "Weekend at Imola" });
  await imola.getByRole("button", { name: "Delete the type Test day" }).click();
  await expect(imola.getByText('Deleted "Test day".')).toBeVisible();
  await imola.getByRole("button", { name: "Cancel" }).click();
  await expect(sessions.getByRole("button")).toHaveCount(5);
});

test("a weekend out of reach says so", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit sessions" }).click();
  const dialog = page.getByRole("dialog", { name: /Weekend at/ });
  await dialog.getByLabel("First day").fill("2027-03-19");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("No forecast reaches this weekend yet."),
  ).toBeVisible();
  await openPage(page, "Session dashboard");
  await expect(
    page.getByText("No forecast reaches this session yet."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit sessions" }).click();
  await dialog.getByLabel("First day").fill("2026-11-10");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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
  await expect(combined.getByText(/12 sources from 9 centres/)).toBeVisible();
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
  await expect(combined.getByText(/12 sources from 9 centres/)).toBeVisible();
  await openPage(page, "History");
  await page.getByRole("radio", { name: "Recent" }).click();
  await expect(page.getByText("Mean temperature, °F")).toBeVisible();
  await expect(page.getByText("Strongest wind, m/s")).toBeVisible();
});

test("history: the weekend's dates over 20 years", async ({
  page,
  services,
}) => {
  await page.goto("/");
  await openPage(page, "History");
  // The weekend is 18 to 20 November; the 20 years before 2026.
  const summary = page.getByRole("region", {
    name: "18 Nov to 20 Nov, 2006 to 2025",
  });
  await expect(summary.getByText("Days with rain")).toBeVisible();
  await expect(summary.getByText("of 20 years")).toBeVisible();
  await expect(summary.getByText(/^Mostly .* °C$/).first()).toBeVisible();
  const years = page.getByRole("region", { name: "Year by year" });
  await expect(years.getByRole("rowheader")).toHaveText(
    Array.from({ length: 20 }, (_, i) => String(2025 - i)),
  );
  // Two days before the weekend, its three days, two after.
  await expect(years.getByRole("columnheader")).toHaveText([
    "Year",
    "16 Nov",
    "17 Nov",
    "18 Nov",
    "19 Nov",
    "20 Nov",
    "21 Nov",
    "22 Nov",
    "High",
    "Wind",
  ]);
  await expect(page.getByText(/reanalysis/)).toBeVisible();
  // One small request per year.
  expect(
    services.requests.filter((host) => host === "archive-api.open-meteo.com"),
  ).toHaveLength(20);

  const download = page.waitForEvent("download");
  await summary.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "pitwall-red-bull-ring-2006-11-16-to-2025-11-22-daily.csv",
  );
});

test("history: recent days from the archive, for the chosen period", async ({
  page,
}) => {
  await page.goto("/");
  await openPage(page, "History");
  await page.getByRole("radio", { name: "Recent" }).click();
  // 30 days ending yesterday, 16 November.
  const summary = page.getByRole("region", {
    name: "Sun 18 Oct to Mon 16 Nov",
  });
  // Every fifth day is wet in the invented archive: 6 of 30.
  await expect(summary.getByText("Rain days")).toBeVisible();
  await expect(summary.getByText("6 of 30")).toBeVisible();
  const days = page.getByRole("region", { name: "Day by day" });
  await expect(days.getByText("Rain, mm per day")).toBeVisible();
  await expect(days.getByText(/Strongest wind, km\/h/)).toBeVisible();

  await page.getByRole("radio", { name: "14 days" }).click();
  await expect(
    page.getByRole("region", { name: "Tue 3 Nov to Mon 16 Nov" }),
  ).toBeVisible();

  // The export has every hour of those days.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export hourly CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(
    "pitwall-red-bull-ring-2026-11-03-to-2026-11-16-hourly.csv",
  );
  const stream = await file.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  const lines = text.trim().split("\r\n");
  expect(lines[0]).toContain(
    "track,hour_start_utc,hour_start_local,temperature_c,rain_mm,wind_kmh,wind_from_deg,gust_kmh",
  );
  // 14 days of 24 hours, on the track's own calendar.
  expect(lines).toHaveLength(1 + 14 * 24);
  expect(lines[1]).toMatch(
    /^Red Bull Ring,2026-11-02T23:00:00Z,2026-11-03T00:00:00\+01:00,/,
  );
});

test("history: any dates, hour by hour", async ({ page }) => {
  await page.goto("/");
  await openPage(page, "History");
  await page.getByRole("radio", { name: "Pick dates" }).click();
  // It starts on the weekend's dates one year earlier.
  await expect(page.getByLabel("First day")).toHaveValue("2025-11-18");
  await expect(page.getByLabel("Last day")).toHaveValue("2025-11-20");
  await expect(
    page.getByRole("region", { name: "18 Nov 2025 to 20 Nov 2025" }),
  ).toBeVisible();
  const hours = page.getByRole("region", { name: "Hour by hour" });
  await expect(hours.getByText("Rain, mm per hour")).toBeVisible();
  await expect(hours.getByText(/Wind, km\/h/)).toBeVisible();

  // A long range is drawn by the day.
  await page.getByLabel("First day").fill("2025-10-01");
  await expect(page.getByRole("region", { name: "Day by day" })).toBeVisible();
  // Checks on the dates.
  await page.getByLabel("First day").fill("2025-12-01");
  await expect(
    page.getByText("The last day is before the first."),
  ).toBeVisible();
  await page.getByLabel("First day").fill("2025-01-01");
  await expect(page.getByText("Pick at most 92 days at a time.")).toBeVisible();
  await page.getByLabel("First day").fill("2026-11-10");
  await page.getByLabel("Last day").fill("2026-11-17");
  await expect(
    page.getByText("The last day must be before today."),
  ).toBeVisible();
});

test("without the archive, history falls back on the bundled log", async ({
  page,
  services,
}) => {
  services.down.add("archive-api.open-meteo.com");
  await page.goto("/");
  await selectTrack(page, "Monza");
  await openPage(page, "History");
  // The same dates in earlier years need the archive.
  await expect(
    page.getByText(
      "The weather service has a problem on its side (status 503). Try again later.",
    ),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Recent" }).click();
  await expect(
    page.getByText(
      "The weather archive cannot be reached. Showing the log that comes with Pitwall.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Thu 29 Oct to Fri 13 Nov" }),
  ).toBeVisible();
  await expect(page.getByText(/OpenWeather/)).toBeVisible();
  // The log has no hours to export.
  await expect(
    page.getByRole("button", { name: "Export hourly CSV" }),
  ).toHaveCount(0);
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
  const rows = page.getByRole("region", { name: "Day by day" });
  await expect(rows.getByRole("heading", { level: 3 })).toHaveCount(2);

  await chips.getByRole("button", { name: "Zandvoort" }).click();
  await chips.getByRole("button", { name: "Sebring" }).click();
  // At most 4: the other tracks can't be added.
  await expect(chips.getByRole("button", { name: "Jerez" })).toBeDisabled();
  // One row of charts per track, from wettest to driest: the invented archive
  // is wetter further north.
  await expect(rows.getByRole("heading", { level: 3 })).toHaveText([
    "Zandvoort",
    "Spa-Francorchamps",
    "Red Bull Ring",
    "Sebring",
  ]);
  const summary = page.getByRole("region", {
    name: "Sun 18 Oct to Mon 16 Nov",
  });
  const totals = await summary
    .locator(".rank")
    .first()
    .locator(".rank-value")
    .evaluateAll((cells) => cells.map((cell) => parseFloat(cell.textContent!)));
  expect(totals).toHaveLength(4);
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
  for (const title of ["Rain days", "Average temperature", "Strongest wind"])
    await expect(summary.getByRole("heading", { name: title })).toBeVisible();

  // Every hour of those days, for the four tracks, in one file.
  const download = page.waitForEvent("download");
  await summary.getByRole("button", { name: "Export hourly CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "pitwall-red-bull-ring-spa-francorchamps-zandvoort-sebring-2026-10-18-to-2026-11-16-hourly.csv",
  );

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
  await expect(rows.getByRole("heading", { level: 3 })).toHaveCount(2);
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
    page.getByText("Offline. Showing the forecast from Tue 17 Nov, 10:20."),
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
    page.getByText(
      "Offline. These dates have not been loaded for this track yet.",
    ),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Recent" }).click();
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
  const circuit = page.getByRole("region", { name: "From above" });
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
