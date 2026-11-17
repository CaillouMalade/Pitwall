// Every adapter on a saved sample answer, with fetch swapped for a fake: no test
// touches the network. The samples are cut-down real answers; the expected
// numbers below are worked out by hand from them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../web/src/lib/http.ts";
import {
  brightSky,
  dmi,
  fmi,
  geosphere,
  metNorway,
  nws,
  openMeteo,
  PROVIDER_IDS,
  PROVIDERS,
  radarFrames,
  smhi,
} from "../web/src/lib/providers/index.ts";
import { readFmi } from "../web/src/lib/providers/fmi.ts";
import { windFrom } from "../web/src/lib/providers/geosphere.ts";
import { durationHours } from "../web/src/lib/providers/nws.ts";
import { OPEN_METEO_MODELS } from "../web/src/lib/providers/open-meteo.ts";
import { SOURCES } from "../web/src/lib/sources.ts";
import type { ForecastPoint } from "../web/src/lib/types.ts";
import {
  FORECAST_DAYS,
  hourlyToWindows,
  sumRain,
  windowStart,
} from "../web/src/lib/windows.ts";
import {
  fakeFetch,
  fixture,
  fixtureText,
  json,
  status,
  text,
  utc,
} from "./helpers.ts";

const MONZA = { name: "Monza", latitude: 45.62, longitude: 9.28 };
const AUSTIN = { name: "Austin", latitude: 30.1328, longitude: -97.6411 };
const NORRKOPING = { name: "Norrköping", latitude: 58, longitude: 16 };
const HELSINKI = { name: "Helsinki", latitude: 60.17, longitude: 24.94 };
const COPENHAGEN = { name: "Copenhagen", latitude: 55.7, longitude: 12.5 };
const SPIELBERG = { name: "Spielberg", latitude: 47.2197, longitude: 14.7647 };
// A fixed "now" inside each sample, so the tests never depend on today's date.
const NOW = utc(2026, 11, 15, 22, 10);

const close = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-9,
    `${actual} ≈ ${expected}`,
  );
const times = (points: ForecastPoint[]) => points.map((point) => point.time);
const url = (fetch: ReturnType<typeof fakeFetch>, call = 0) =>
  new globalThis.URL(fetch.calls[call].url);

async function noCoverage(run: Promise<unknown>) {
  await assert.rejects(
    run,
    (error) => error instanceof ServiceError && error.kind === "no-coverage",
  );
}

// The windows

test("window start and rain sums", () => {
  assert.equal(windowStart(utc(2026, 11, 15, 14, 20)), utc(2026, 11, 15, 12));
  close(sumRain([0.4, 0.4, 1.4]), 2.2);
  assert.equal(sumRain([0.4, null, 1.4]), null);
  assert.equal(sumRain([0.4, undefined, 1.4]), null);
});

test("hourly values become windows: values at the start, rain over 3 hours", () => {
  const start = utc(2026, 11, 16);
  const hour = 3_600_000;
  const instant = (temperature: number) => ({
    temperature,
    windSpeed: 2,
    windDeg: 90,
  });
  const points = hourlyToWindows(
    "test",
    new Map([
      [start, instant(5)],
      [start + hour, instant(6)],
      [start + 3 * hour, instant(8)],
    ]),
    new Map([
      [start, 0.5],
      [start + hour, 0.25],
      [start + 2 * hour, 0.25],
      [start + 3 * hour, 1],
    ]),
  );
  assert.deepEqual(points, [
    { source: "test", time: start, ...instant(5), rain: 1 },
    // Only one of the window's 3 hours has rain: the total is not known.
    { source: "test", time: start + 3 * hour, ...instant(8), rain: null },
  ]);
});

test("a window where the source says nothing is left out", () => {
  const start = utc(2026, 11, 16);
  assert.deepEqual(
    hourlyToWindows(
      "test",
      new Map([[start, { temperature: null, windSpeed: null, windDeg: null }]]),
      new Map([[start, null]]),
    ),
    [],
  );
});

// Open-Meteo

const ONE_MODEL = [["icon_seamless", "dwd-icon"]] as const;

test("Open-Meteo windows, units and rain", async () => {
  const fetch = fakeFetch(json(fixture("open-meteo.json")));
  const points = await openMeteo(fetch, ONE_MODEL).forecast(MONZA, NOW);
  // 18:00 is before the current window (21:00).
  assert.deepEqual(times(points), [
    utc(2026, 11, 15, 21),
    utc(2026, 11, 16, 0),
    utc(2026, 11, 16, 3),
    utc(2026, 11, 16, 6),
    utc(2026, 11, 16, 9),
  ]);
  const [first] = points;
  assert.equal(first.source, "dwd-icon");
  assert.equal(first.temperature, 7.1);
  assert.equal(first.windSpeed, 0.61);
  assert.equal(first.windDeg, 81);
  // Rain 21:00-00:00 is the values at 22:00, 23:00 and 00:00.
  close(first.rain, 0.1);
  // Rain 00:00-03:00 is the values at 01:00, 02:00 and 03:00.
  close(points[1].rain, 2.2);
  // The answer ends at 09:00, so that window has values but no rain total.
  assert.equal(points[4].temperature, 7.6);
  assert.equal(points[4].rain, null);
  const { searchParams } = url(fetch);
  assert.equal(searchParams.get("wind_speed_unit"), "ms");
  assert.equal(searchParams.get("timezone"), "UTC");
  assert.equal(searchParams.get("models"), "icon_seamless");
  assert.equal(searchParams.get("forecast_days"), String(FORECAST_DAYS + 1));
  assert.equal(searchParams.get("apikey"), null);
});

test("Open-Meteo returns one source per model that has data", async () => {
  const models = [
    ["ecmwf_ifs025", "ecmwf-ifs"],
    ["gfs_seamless", "noaa-gfs"],
    // All null in the sample: a model with nothing for this place.
    ["bom_access_global", "bom"],
    // Not in the sample at all: a regional model outside its area.
    ["meteoswiss_icon_seamless", "meteoswiss-icon"],
  ] as const;
  const fetch = fakeFetch(json(fixture("open-meteo-models.json")));
  const points = await openMeteo(fetch, models).forecast(
    MONZA,
    utc(2026, 11, 17, 1),
  );
  assert.deepEqual(
    [...new Set(points.map((point) => point.source))],
    ["ecmwf-ifs", "noaa-gfs"],
  );
  const ecmwf = points.filter((point) => point.source === "ecmwf-ifs");
  assert.deepEqual(times(ecmwf), [
    utc(2026, 11, 17, 0),
    utc(2026, 11, 17, 3),
    utc(2026, 11, 17, 6),
    utc(2026, 11, 17, 9),
    utc(2026, 11, 17, 12),
  ]);
  assert.equal(ecmwf[0].temperature, 4.3);
  // 0.4 + 0.4 + 0.4 mm at 01:00, 02:00 and 03:00.
  close(ecmwf[0].rain, 1.2);
  const gfs = points.filter((point) => point.source === "noaa-gfs");
  assert.equal(gfs[0].windSpeed, 1.34);
  assert.equal(gfs[0].windDeg, 153);
  // 0.3 + 1.3 + 0.3 mm.
  close(gfs[0].rain, 1.9);
  assert.equal(
    url(fetch).searchParams.get("models"),
    "ecmwf_ifs025,gfs_seamless,bom_access_global,meteoswiss_icon_seamless",
  );
});

test("Open-Meteo asks for every model in one request", async () => {
  const fetch = fakeFetch(json(fixture("open-meteo-models.json")));
  await openMeteo(fetch).forecast(
    { name: "Monza", latitude: 45.619123456, longitude: 9.282299 },
    utc(2026, 11, 17, 1),
  );
  assert.equal(fetch.calls.length, 1);
  // The place is sent to about 11 m, no finer.
  assert.equal(url(fetch).searchParams.get("latitude"), "45.6191");
  assert.equal(url(fetch).searchParams.get("longitude"), "9.2823");
  assert.equal(
    url(fetch).searchParams.get("models"),
    OPEN_METEO_MODELS.map(([model]) => model).join(","),
  );
});

test("Open-Meteo unreadable answer", async () => {
  const run = (data: unknown) =>
    openMeteo(fakeFetch(json(data)), ONE_MODEL).forecast(MONZA, NOW);
  await assert.rejects(
    run({ hourly: { time: ["2026-11-15T21:00"], temperature_2m: 7 } }),
    { message: "Open-Meteo sent a forecast in an unexpected format." },
  );
  await assert.rejects(run([]), /unexpected format/);
});

test("a bad location is stopped before any request", async () => {
  for (const id of PROVIDER_IDS) {
    const fetch = fakeFetch(json({}));
    await assert.rejects(
      PROVIDERS[id](fetch).forecast(
        { name: "Nowhere", latitude: "abc" as unknown as number, longitude: 9 },
        NOW,
      ),
      /invalid coordinates/,
      id,
    );
    assert.equal(fetch.calls.length, 0, id);
  }
});

test("each source keeps the forecast range from the current window", async () => {
  const start = utc(2026, 11, 16);
  const hours = (FORECAST_DAYS + 1) * 24 + 4;
  const time = Array.from({ length: hours }, (_, i) =>
    new Date(start + i * 3_600_000).toISOString().slice(0, 16),
  );
  const values = time.map(() => 1);
  const points = await openMeteo(
    fakeFetch(
      json({
        hourly: {
          time,
          temperature_2m: values,
          wind_speed_10m: values,
          wind_direction_10m: values,
          precipitation: values,
        },
      }),
    ),
    ONE_MODEL,
  ).forecast(MONZA, start + 3_600_000);
  assert.equal(points.length, FORECAST_DAYS * 8);
  assert.equal(points[0].time, start);
  assert.equal(
    points.at(-1)!.time,
    start + FORECAST_DAYS * 24 * 3_600_000 - 3 * 3_600_000,
  );
});

// MET Norway

test("MET Norway windows, units and rain", async () => {
  const fetch = fakeFetch(json(fixture("met-norway.json")));
  const points = await metNorway(fetch).forecast(MONZA, NOW);
  assert.deepEqual(times(points), [
    utc(2026, 11, 15, 21),
    utc(2026, 11, 16, 0),
    utc(2026, 11, 16, 3),
    utc(2026, 11, 16, 6),
    utc(2026, 11, 16, 9),
  ]);
  const [first] = points;
  assert.equal(first.source, "met-norway");
  assert.equal(first.temperature, 5.5);
  assert.equal(first.windSpeed, 1.0);
  assert.equal(first.windDeg, 12.8);
  // Rain 00:00-03:00 is next_1_hours at 00:00, 01:00 and 02:00: 0.0 + 0.2 + 0.0.
  close(points[1].rain, 0.2);
  assert.deepEqual(Object.fromEntries(url(fetch).searchParams), {
    lat: "45.62",
    lon: "9.28",
  });
});

test("MET Norway sends at most 4 decimals", async () => {
  const fetch = fakeFetch(json(fixture("met-norway.json")));
  await metNorway(fetch).forecast(
    { name: "Monza", latitude: 45.619123456, longitude: 9.282299 },
    NOW,
  );
  assert.equal(url(fetch).searchParams.get("lat"), "45.6191");
  assert.equal(url(fetch).searchParams.get("lon"), "9.2823");
});

test("MET Norway keeps no rain for a window without three hourly values", async () => {
  const data = fixture<{
    properties: { timeseries: { data: Record<string, unknown> }[] };
  }>("met-norway.json");
  const { timeseries } = data.properties;
  // Like further out in a real answer: 01:00 has no hourly rain, 04:00 is missing.
  delete timeseries[7].data.next_1_hours;
  timeseries.splice(10, 1);
  const points = await metNorway(fakeFetch(json(data))).forecast(MONZA, NOW);
  assert.deepEqual(
    points.map((point) => point.rain === null),
    [false, true, true, false, true],
  );
  // The temperature at the start of those windows is still there.
  assert.equal(points[1].temperature, 6);
});

test("MET Norway unreadable answer", async () => {
  await assert.rejects(
    metNorway(fakeFetch(json({ properties: {} }))).forecast(MONZA, NOW),
    { message: "MET Norway sent a forecast in an unexpected format." },
  );
});

test("two sources give the same windows", async () => {
  const a = await openMeteo(
    fakeFetch(json(fixture("open-meteo.json"))),
    ONE_MODEL,
  ).forecast(MONZA, NOW);
  const b = await metNorway(
    fakeFetch(json(fixture("met-norway.json"))),
  ).forecast(MONZA, NOW);
  assert.ok(a.length > 0);
  assert.deepEqual(times(a), times(b));
});

// Bright Sky (DWD)

test("Bright Sky windows, km/h to m/s and rain of the hour before", async () => {
  const now = utc(2026, 11, 17, 1);
  const fetch = fakeFetch(json(fixture("bright-sky.json")));
  const points = await brightSky(fetch).forecast(MONZA, now);
  assert.deepEqual(times(points), [
    utc(2026, 11, 17, 0),
    utc(2026, 11, 17, 3),
    utc(2026, 11, 17, 6),
    utc(2026, 11, 17, 9),
  ]);
  const [first] = points;
  assert.equal(first.source, "dwd-mosmix");
  assert.equal(first.temperature, 3.7);
  // 4.0 km/h.
  close(first.windSpeed, 4 / 3.6);
  assert.equal(first.windDeg, 150);
  // Rain 00:00-03:00 is the values at 01:00, 02:00 and 03:00: 0.5 + 0.5 + 1.4.
  close(first.rain, 2.4);
  assert.equal(points[3].rain, null);
  const { searchParams } = url(fetch);
  assert.equal(searchParams.get("lat"), "45.62");
  assert.equal(searchParams.get("date"), "2026-11-17T00:00:00.000Z");
  assert.equal(searchParams.get("last_date"), "2026-11-24T00:00:00.000Z");
});

test("Bright Sky without a station nearby has nothing for the place", async () => {
  await noCoverage(brightSky(fakeFetch(status(404))).forecast(MONZA, NOW));
});

test("Bright Sky unreadable answer", async () => {
  await assert.rejects(
    brightSky(fakeFetch(json({ weather: "none" }))).forecast(MONZA, NOW),
    { message: "Bright Sky sent a forecast in an unexpected format." },
  );
});

// US National Weather Service

const nwsFetch = () =>
  fakeFetch((address) =>
    json(
      fixture(
        address.includes("/points/") ? "nws-points.json" : "nws-grid.json",
      ),
    ),
  );

test("NWS asks for the grid cell, then reads its layers", async () => {
  const fetch = nwsFetch();
  const provider = nws(fetch);
  const now = utc(2026, 11, 17, 13, 30);
  const points = await provider.forecast(AUSTIN, now);
  assert.deepEqual(
    fetch.calls.map((call) => call.url),
    [
      "https://api.weather.gov/points/30.1328,-97.6411",
      "https://api.weather.gov/gridpoints/EWX/160,85",
    ],
  );
  assert.equal(points[0].source, "nws");
  assert.equal(points[0].time, utc(2026, 11, 17, 15));
  // 10.56 °C at 15:00; wind 9.26 km/h for the two hours from 15:00.
  close(points[0].temperature, 10.555555555555555);
  close(points[0].windSpeed, 9.26 / 3.6);
  assert.equal(points[0].windDeg, 20);
  assert.equal(points[0].rain, 0);
  // The grid cell is remembered: the second forecast is one request.
  await provider.forecast(AUSTIN, now);
  assert.equal(fetch.calls.length, 3);
});

test("NWS shares a rain total evenly over its hours", async () => {
  const grid = fixture<{
    properties: Record<string, { uom: string; values: unknown[] }>;
  }>("nws-grid.json");
  grid.properties.quantitativePrecipitation.values = [
    { validTime: "2026-11-17T18:00:00+00:00/PT6H", value: 6 },
  ];
  const fetch = fakeFetch((address) =>
    json(address.includes("/points/") ? fixture("nws-points.json") : grid),
  );
  const points = await nws(fetch).forecast(AUSTIN, utc(2026, 11, 17, 13, 30));
  const rain = Object.fromEntries(
    points.map((point) => [new Date(point.time).getUTCHours(), point.rain]),
  );
  // 6 mm in 6 hours: 3 mm in each of the two windows it covers.
  assert.equal(rain[18], 3);
  assert.equal(rain[21], 3);
  assert.equal(rain[15], null);
});

test("NWS durations", () => {
  assert.equal(durationHours("PT1H"), 1);
  assert.equal(durationHours("PT6H"), 6);
  assert.equal(durationHours("P1DT12H"), 36);
  assert.equal(durationHours("P7D"), 168);
  assert.equal(durationHours("PT30M"), 1);
  assert.throws(() => durationHours("six hours"));
  assert.throws(() => durationHours(""));
});

test("NWS covers the United States only", async () => {
  const provider = nws(fakeFetch(status(404)));
  assert.equal(provider.covers!(AUSTIN), true);
  assert.equal(provider.covers!(MONZA), false);
  // Inside the box but not in the US (Toronto): the service says so with a 404.
  await noCoverage(
    provider.forecast(
      { name: "Toronto", latitude: 43.65, longitude: -79.38 },
      NOW,
    ),
  );
});

test("NWS only follows a link to its own grid data", async () => {
  const fetch = fakeFetch(
    json({ properties: { forecastGridData: "https://example.test/grid" } }),
  );
  await assert.rejects(nws(fetch).forecast(AUSTIN, NOW), {
    message:
      "The National Weather Service sent a forecast in an unexpected format.",
  });
  assert.equal(fetch.calls.length, 1);
});

test("NWS refuses a unit it does not know", async () => {
  const grid = fixture<{
    properties: Record<string, { uom: string; values: unknown[] }>;
  }>("nws-grid.json");
  grid.properties.windSpeed.uom = "wmoUnit:furlong_fortnight-1";
  const fetch = fakeFetch((address) =>
    json(address.includes("/points/") ? fixture("nws-points.json") : grid),
  );
  await assert.rejects(nws(fetch).forecast(AUSTIN, NOW), /unexpected format/);
});

// SMHI

test("SMHI windows and hourly rain", async () => {
  const fetch = fakeFetch(json(fixture("smhi.json")));
  const points = await smhi(fetch).forecast(
    NORRKOPING,
    utc(2026, 11, 17, 20, 10),
  );
  assert.deepEqual(times(points), [
    utc(2026, 11, 17, 21),
    utc(2026, 11, 18, 0),
    utc(2026, 11, 18, 3),
    utc(2026, 11, 20, 6),
    utc(2026, 11, 20, 12),
  ]);
  assert.equal(points[0].source, "smhi");
  assert.equal(points[0].temperature, 0.8);
  assert.equal(points[0].windSpeed, 1.8);
  assert.equal(points[0].windDeg, 5);
  assert.equal(points[0].rain, 0);
  // 00:00-03:00: the intervals ending at 01:00, 02:00 and 03:00: 0 + 0.1 + 0.1.
  close(points[1].rain, 0.2);
  // Further out the steps are 3 and 6 hours long: values, but no rain total.
  assert.equal(points[3].temperature, -2.3);
  assert.equal(points[3].rain, null);
  assert.match(
    fetch.calls[0].url,
    /\/category\/snow1g\/version\/1\/geotype\/point\/lon\/16\/lat\/58\/data\.json$/,
  );
});

test("SMHI covers the Nordic area only", async () => {
  const provider = smhi(fakeFetch(status(404)));
  assert.equal(provider.covers!(NORRKOPING), true);
  assert.equal(provider.covers!(MONZA), false);
  await noCoverage(provider.forecast(NORRKOPING, NOW));
});

test("SMHI missing values and unreadable answer", async () => {
  const data = fixture<{
    timeSeries: { data: Record<string, number> }[];
  }>("smhi.json");
  data.timeSeries[1].data.air_temperature = 9999;
  const points = await smhi(fakeFetch(json(data))).forecast(
    NORRKOPING,
    utc(2026, 11, 17, 20, 10),
  );
  assert.equal(points[0].temperature, null);
  await assert.rejects(
    smhi(fakeFetch(json({ timeSeries: {} }))).forecast(NORRKOPING, NOW),
    { message: "SMHI sent a forecast in an unexpected format." },
  );
});

// FMI

test("FMI reads the XML into windows", async () => {
  const fetch = fakeFetch(text(fixtureText("fmi.xml")));
  const points = await fmi(fetch).forecast(HELSINKI, utc(2026, 11, 17, 20, 10));
  assert.deepEqual(times(points), [
    utc(2026, 11, 17, 21),
    utc(2026, 11, 18, 0),
    utc(2026, 11, 18, 3),
  ]);
  assert.equal(points[0].source, "fmi-harmonie");
  assert.equal(points[0].temperature, 6.3);
  assert.equal(points[0].windSpeed, 6.24);
  assert.equal(points[0].windDeg, 185);
  // 21:00-00:00: the hours ending at 22:00, 23:00 and 00:00: 0.1 + 0.2 + 0.2.
  close(points[0].rain, 0.5);
  // 00:00-03:00: 0.3 + 0.1 + 0.0.
  close(points[1].rain, 0.4);
  assert.equal(points[2].rain, null);
  const { searchParams } = url(fetch);
  assert.equal(
    searchParams.get("storedquery_id"),
    "fmi::forecast::harmonie::surface::point::simple",
  );
  assert.equal(searchParams.get("latlon"), "60.17,24.94");
  assert.equal(searchParams.get("starttime"), "2026-11-17T18:00:00Z");
});

test("FMI values: NaN is missing, and other text is ignored", () => {
  const element = (time: string, name: string, value: string) =>
    `<BsWfs:Time>${time}</BsWfs:Time>
     <BsWfs:ParameterName>${name}</BsWfs:ParameterName>
     <BsWfs:ParameterValue>${value}</BsWfs:ParameterValue>`;
  const rows = readFmi(
    element("2026-11-17T21:00:00Z", "Temperature", "NaN") +
      element("2026-11-17T21:00:00Z", "WindSpeedMS", "4.5") +
      element("not a time", "Temperature", "3"),
  );
  assert.deepEqual(
    [...rows.entries()],
    [[utc(2026, 11, 17, 21), { Temperature: null, WindSpeedMS: 4.5 }]],
  );
});

test("FMI covers northern Europe only", async () => {
  const provider = fmi(fakeFetch(status(400)));
  assert.equal(provider.covers!(HELSINKI), true);
  assert.equal(provider.covers!(MONZA), false);
  // FMI answers 400 for a point its model does not reach.
  await noCoverage(provider.forecast(HELSINKI, NOW));
});

test("FMI answer without values", async () => {
  await assert.rejects(
    fmi(fakeFetch(text("<wfs:FeatureCollection/>"))).forecast(HELSINKI, NOW),
    { message: "FMI sent a forecast in an unexpected format." },
  );
});

// DMI

test("DMI windows, kelvin to °C and rain from the running total", async () => {
  const fetch = fakeFetch(json(fixture("dmi.json")));
  const points = await dmi(fetch).forecast(
    COPENHAGEN,
    utc(2026, 11, 17, 15, 10),
  );
  assert.deepEqual(times(points), [
    utc(2026, 11, 17, 15),
    utc(2026, 11, 17, 18),
    utc(2026, 11, 17, 21),
  ]);
  assert.equal(points[0].source, "dmi-harmonie");
  close(points[0].temperature, 278.82227 - 273.15);
  assert.equal(points[0].windSpeed, 1.9745638);
  assert.equal(points[0].windDeg, 129.27873);
  // The total goes 0, 0.00071, 0.00097, 0.00068: two small steps up, then a
  // wobble down that counts as no rain.
  close(points[0].rain, 0.00097465515);
  // The answer ends at 22:00, so the 21:00 window has no rain total.
  assert.equal(points[2].rain, null);
  assert.equal(url(fetch).searchParams.get("coords"), "POINT(12.5 55.7)");
  assert.equal(url(fetch).searchParams.get("crs"), "crs84");
});

interface DmiAnswer {
  domain: { axes: Record<string, { values: number[] }> };
  ranges: Record<string, { values: number[] }>;
}

test("DMI: a total that drops is a new model run, not rain", async () => {
  const data = fixture<DmiAnswer>("dmi.json");
  data.ranges["total-precipitation"].values = [0, 1, 2.5, 4, 0, 0.5, 1, 2];
  const points = await dmi(fakeFetch(json(data))).forecast(
    COPENHAGEN,
    utc(2026, 11, 17, 15, 10),
  );
  // 15:00-18:00: 1 + 1.5 + 1.5.
  assert.equal(points[0].rain, 4);
  // 18:00-19:00 falls from 4 to 0: that hour is not known.
  assert.equal(points[1].rain, null);
});

test("DMI answers with its nearest grid point: too far means not covered", async () => {
  const data = fixture<DmiAnswer>("dmi.json");
  data.domain.axes.x.values = [40.07];
  data.domain.axes.y.values = [62.67];
  const provider = dmi(fakeFetch(json(data)));
  await noCoverage(provider.forecast(COPENHAGEN, NOW));
  assert.equal(provider.covers!(COPENHAGEN), true);
  assert.equal(provider.covers!(AUSTIN), false);
});

test("DMI unreadable answer", async () => {
  await assert.rejects(
    dmi(fakeFetch(json({ domain: {} }))).forecast(COPENHAGEN, NOW),
    { message: "DMI sent a forecast in an unexpected format." },
  );
});

// GeoSphere Austria

const GEOSPHERE = {
  reference_time: "2026-11-17T15:00+00:00",
  timestamps: [
    "2026-11-17T18:00+00:00",
    "2026-11-17T19:00+00:00",
    "2026-11-17T20:00+00:00",
    "2026-11-17T21:00+00:00",
    "2026-11-17T22:00+00:00",
  ],
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [14.766, 47.211] },
      properties: {
        parameters: {
          "2t": { unit: "degree Celsius", data: [3.1, 2.8, 2.5, 2.2, 2] },
          "10u": { unit: "m s-1", data: [3, 0, -4, 0, null] },
          "10v": { unit: "m s-1", data: [4, -2, 0, 5, 1] },
          tp: { unit: "kg m-2", data: [0.2, 0.4, 0.6, 1, 0] },
        },
      },
    },
  ],
};

test("GeoSphere windows, wind from its two parts and rain", async () => {
  const fetch = fakeFetch(json(GEOSPHERE));
  const points = await geosphere(fetch).forecast(
    SPIELBERG,
    utc(2026, 11, 17, 18, 10),
  );
  assert.deepEqual(times(points), [
    utc(2026, 11, 17, 18),
    utc(2026, 11, 17, 21),
  ]);
  assert.equal(points[0].source, "geosphere");
  assert.equal(points[0].temperature, 3.1);
  // 3 m/s to the east and 4 m/s to the north: 5 m/s, from the south-west.
  close(points[0].windSpeed, 5);
  close(points[0].windDeg, 216.86989764584402);
  // 18:00-21:00: the hours ending at 19:00, 20:00 and 21:00: 0.4 + 0.6 + 1.
  close(points[0].rain, 2);
  assert.equal(points[1].windSpeed, 5);
  assert.equal(points[1].rain, null);
  assert.equal(url(fetch).searchParams.get("parameters"), "2t,10u,10v,tp");
  assert.equal(url(fetch).searchParams.get("lat_lon"), "47.2197,14.7647");
});

test("wind direction from its eastward and northward parts", () => {
  // Blowing towards the north comes from the south, and so on.
  close(windFrom(0, 5), 180);
  close(windFrom(5, 0), 270);
  close(windFrom(0, -5), 0);
  close(windFrom(-5, 0), 90);
});

test("GeoSphere covers the Alps and central Europe only", async () => {
  const provider = geosphere(fakeFetch(json(GEOSPHERE)));
  assert.equal(provider.covers!(SPIELBERG), true);
  assert.equal(provider.covers!(MONZA), true);
  assert.equal(provider.covers!(COPENHAGEN), false);
  await assert.rejects(
    geosphere(fakeFetch(json({ timestamps: [] }))).forecast(SPIELBERG, NOW),
    { message: "GeoSphere Austria sent a forecast in an unexpected format." },
  );
});

// Every adapter

test("every source belongs to an adapter, and every adapter's sources are known", () => {
  const known = new Set(SOURCES.map((source) => source.id));
  const returned = new Set<string>();
  for (const id of PROVIDER_IDS) {
    const provider = PROVIDERS[id]();
    assert.equal(provider.id, id);
    for (const source of provider.sources) {
      assert.ok(known.has(source), `${source} is not in SOURCES`);
      assert.equal(
        SOURCES.find((item) => item.id === source)!.provider,
        id,
        source,
      );
      returned.add(source);
    }
  }
  assert.deepEqual([...returned].sort(), [...known].sort());
});

test("every adapter reports a server error with the shared message", async () => {
  for (const id of PROVIDER_IDS) {
    const place =
      { nws: AUSTIN, smhi: NORRKOPING, fmi: HELSINKI }[id as string] ??
      SPIELBERG;
    await assert.rejects(
      PROVIDERS[id](fakeFetch(status(503))).forecast(place, NOW),
      /problem on its side \(status 503\)/,
      id,
    );
  }
});

// The radar

const RADAR = {
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: [
      { time: 1794755400, path: "/v2/radar/older" },
      { time: 1794756000, path: "/v2/radar/newest" },
    ],
  },
};

test("the radar returns every image, oldest first", async () => {
  const frames = await radarFrames(fakeFetch(json(RADAR)));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].time, utc(2026, 11, 15, 15, 10));
  assert.equal(
    frames.at(-1)!.url,
    "https://tilecache.rainviewer.com/v2/radar/newest/256/{z}/{x}/{y}/2/1_1.png",
  );
});

test("an empty radar list has its own message", async () => {
  await assert.rejects(radarFrames(fakeFetch(json({ radar: { past: [] } }))), {
    message: "RainViewer sent its radar list in an unexpected format.",
  });
  await assert.rejects(
    radarFrames(fakeFetch(json({ ...RADAR, radar: { past: [] } }))),
    {
      message: "RainViewer sent its radar list in an unexpected format.",
    },
  );
});

test("radar tiles are only taken from RainViewer's servers", async () => {
  for (const host of [
    "https://example.test",
    "http://tilecache.rainviewer.com",
    "https://rainviewer.com.example.test",
  ])
    await assert.rejects(
      radarFrames(fakeFetch(json({ ...RADAR, host }))),
      /unexpected format/,
      host,
    );
});

test("a radar server error uses the shared message", async () => {
  await assert.rejects(
    radarFrames(fakeFetch(status(503))),
    /problem on its side/,
  );
});
