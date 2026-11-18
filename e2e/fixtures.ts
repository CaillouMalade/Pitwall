import { test as base, expect, type Page, type Route } from "@playwright/test";

// Synthetic answers from every outside service, for the browser tests only. The
// shipped app has no demo mode: every forecast it shows comes from the real
// services. Nothing but localhost is reached during a test.
export const TEST_TIME = new Date("2026-11-17T09:20:00Z");
const DAY_START = Date.UTC(2026, 10, 17);
const HOUR = 3_600_000;
const HOURS = 8 * 24;

const iso = (time: number) => new Date(time).toISOString();
const hours = (count = HOURS) =>
  Array.from({ length: count }, (_, i) => DAY_START + i * HOUR);

// One invented forecast per source, written out below in each service's own
// format. A wet spell on the first afternoon of the weekend (18 November,
// 12:00 to 18:00 UTC, which is 13:00 to 19:00 at the European tracks) with a different amount per source, so they disagree.
const WET_FROM = Date.UTC(2026, 10, 18, 12);
const WET_TO = Date.UTC(2026, 10, 18, 18);

interface Invented {
  /** Offsets from the shared temperature (°C), wind (m/s) and direction (°). */
  temperature: number;
  wind: number;
  direction: number;
  /** mm per hour during the wet spell. */
  rain: number;
}

const SOURCES: Record<string, Invented> = {
  ecmwf_ifs025: { temperature: 0, wind: 0, direction: 0, rain: 0.6 },
  ecmwf_aifs025_single: {
    temperature: 0.2,
    wind: 0.2,
    direction: 4,
    rain: 0.6,
  },
  gfs_seamless: { temperature: 0.6, wind: 0.5, direction: -6, rain: 0.6 },
  icon_seamless: { temperature: -0.4, wind: -0.3, direction: 8, rain: 0.1 },
  meteofrance_seamless: {
    temperature: 0.3,
    wind: 0.8,
    direction: 2,
    rain: 0.6,
  },
  ukmo_seamless: { temperature: -0.2, wind: -0.6, direction: -3, rain: 0 },
  gem_seamless: { temperature: 0.9, wind: 1.1, direction: 6, rain: 0.1 },
  jma_seamless: { temperature: -0.8, wind: -0.9, direction: -8, rain: 0 },
  cma_grapes_global: { temperature: 1.2, wind: 0.4, direction: 5, rain: 0.6 },
  "met-norway": { temperature: -0.6, wind: 0.6, direction: 7, rain: 0.4 },
  "bright-sky": { temperature: -0.3, wind: -0.1, direction: 3, rain: 0.5 },
  dmi: { temperature: 0.4, wind: 0.3, direction: -4, rain: 0 },
  geosphere: { temperature: -1, wind: -0.4, direction: 9, rain: 1 },
  nws: { temperature: 0.5, wind: 0.2, direction: -2, rain: 0.6 },
};

/** Open-Meteo's models with nothing for the test tracks: regional ones. */
const REGIONAL = [
  "knmi_harmonie_arome_europe",
  "meteoswiss_icon_seamless",
  "italia_meteo_arpae_icon_2i",
];

const temperature = (source: string, time: number) =>
  Number(
    (
      11 +
      4 * Math.sin(((time - DAY_START) / HOUR - 9) / 3.8) +
      SOURCES[source].temperature
    ).toFixed(1),
  );
const wind = (source: string, time: number) =>
  Number(
    (
      4 +
      (((time - DAY_START) / HOUR) % 24) / 12 +
      SOURCES[source].wind
    ).toFixed(2),
  );
const direction = (source: string) => 225 + SOURCES[source].direction;
/** The rain that falls in the hour starting at `time`. */
const rain = (source: string, time: number) =>
  time >= WET_FROM && time < WET_TO ? SOURCES[source].rain : 0;

function openMeteoAnswer(url: URL) {
  const models = (url.searchParams.get("models") ?? "").split(",");
  const times = hours();
  const hourly: Record<string, unknown[]> = {
    time: times.map((time) => iso(time).slice(0, 16)),
  };
  for (const model of models) {
    if (REGIONAL.includes(model) || !SOURCES[model]) continue;
    hourly[`temperature_2m_${model}`] = times.map((time) =>
      temperature(model, time),
    );
    hourly[`wind_speed_10m_${model}`] = times.map((time) => wind(model, time));
    hourly[`wind_direction_10m_${model}`] = times.map(() => direction(model));
    // The value at an hour is the rain of the hour before it.
    hourly[`precipitation_${model}`] = times.map((time) =>
      rain(model, time - HOUR),
    );
  }
  return { hourly };
}

/**
 * The rain map: 49 places in 15-minute steps. A band of rain moves from west
 * to east, so the frames differ and the middle (the track) gets wet for a while.
 */
function rainGridAnswer(url: URL) {
  const first = Date.parse(url.searchParams.get("start_minutely_15") + "Z");
  const last = Date.parse(url.searchParams.get("end_minutely_15") + "Z");
  const places = (url.searchParams.get("latitude") ?? "").split(",").length;
  const steps = Math.round((last - first) / (15 * 60_000)) + 1;
  const times = Array.from(
    { length: steps },
    (_, i) => first + i * 15 * 60_000,
  );
  return Array.from({ length: places }, (_, place) => ({
    minutely_15: {
      time: times.map((time) => iso(time).slice(0, 16)),
      precipitation: times.map((_, step) =>
        Math.abs((place % 7) - (step % 9)) <= 1 ? 0.3 : 0,
      ),
    },
  }));
}

function metNorwayAnswer() {
  return {
    properties: {
      timeseries: hours(70).map((time) => ({
        time: iso(time).replace(".000", ""),
        data: {
          instant: {
            details: {
              air_temperature: temperature("met-norway", time),
              wind_speed: wind("met-norway", time),
              wind_from_direction: direction("met-norway"),
            },
          },
          next_1_hours: {
            details: { precipitation_amount: rain("met-norway", time) },
          },
        },
      })),
    },
  };
}

function brightSkyAnswer() {
  return {
    weather: hours(7 * 24).map((time) => ({
      timestamp: iso(time).replace(".000Z", "+00:00"),
      temperature: temperature("bright-sky", time),
      wind_speed: Number((wind("bright-sky", time) * 3.6).toFixed(1)),
      wind_direction: direction("bright-sky"),
      precipitation: rain("bright-sky", time - HOUR),
    })),
    sources: [],
  };
}

function dmiAnswer(url: URL) {
  const [longitude, latitude] = (url.searchParams.get("coords") ?? "")
    .replace(/[^-\d. ]/g, "")
    .trim()
    .split(" ")
    .map(Number);
  const times = hours(60);
  let total = 0;
  return {
    type: "Coverage",
    domain: {
      axes: {
        t: { values: times.map(iso) },
        x: { values: [longitude] },
        y: { values: [latitude] },
      },
    },
    ranges: {
      "temperature-2m": {
        values: times.map((time) => temperature("dmi", time) + 273.15),
      },
      "wind-speed-10m": { values: times.map((time) => wind("dmi", time)) },
      "wind-dir-10m": { values: times.map(() => direction("dmi")) },
      // A running total: each value is the rain before that hour.
      "total-precipitation": {
        values: times.map((time) => {
          const before = total;
          total += rain("dmi", time);
          return before;
        }),
      },
    },
  };
}

function geosphereAnswer() {
  const times = hours(60);
  const speed = (time: number) => wind("geosphere", time);
  // Wind from 234° blows towards the north-east.
  const from = (direction("geosphere") * Math.PI) / 180;
  return {
    timestamps: times.map((time) => iso(time).replace(":00.000Z", "+00:00")),
    features: [
      {
        properties: {
          parameters: {
            "2t": { data: times.map((time) => temperature("geosphere", time)) },
            "10u": { data: times.map((time) => -speed(time) * Math.sin(from)) },
            "10v": { data: times.map((time) => -speed(time) * Math.cos(from)) },
            tp: { data: times.map((time) => rain("geosphere", time - HOUR)) },
          },
        },
      },
    ],
  };
}

const NWS_GRID = "https://api.weather.gov/gridpoints/TST/10,20";

function nwsGridAnswer() {
  const times = hours(7 * 24);
  const layer = (uom: string, value: (time: number) => number) => ({
    uom,
    values: times.map((time) => ({
      validTime: `${iso(time).replace(".000Z", "+00:00")}/PT1H`,
      value: value(time),
    })),
  });
  return {
    properties: {
      temperature: layer("wmoUnit:degC", (time) => temperature("nws", time)),
      windSpeed: layer("wmoUnit:km_h-1", (time) => wind("nws", time) * 3.6),
      windDirection: layer("wmoUnit:degree_(angle)", () => direction("nws")),
      quantitativePrecipitation: layer("wmoUnit:mm", (time) =>
        rain("nws", time),
      ),
    },
  };
}

/** Hourly history: a degree warmer each hour of the day, rain from 12:00 to 14:00 UTC. */
function archiveHoursAnswer(url: URL) {
  const first = Date.parse(url.searchParams.get("start_date") + "T00:00:00Z");
  const last = Date.parse(url.searchParams.get("end_date") + "T00:00:00Z");
  const times = Array.from(
    { length: Math.round((last - first) / HOUR) + 24 },
    (_, i) => first + i * HOUR,
  );
  const hour = (time: number) => new Date(time).getUTCHours();
  return {
    hourly: {
      time: times.map((time) => iso(time).slice(0, 16)),
      temperature_2m: times.map((time) => 5 + hour(time) / 2),
      precipitation: times.map((time) =>
        hour(time) >= 13 && hour(time) <= 14 ? 1.5 : 0,
      ),
      wind_speed_10m: times.map((time) => 3 + (hour(time) % 6)),
      wind_direction_10m: times.map(() => 240),
      wind_gusts_10m: times.map((time) => 7 + (hour(time) % 6)),
    },
  };
}

/** Daily history that differs by latitude, so tracks rank in a known order. */
function archiveAnswer(url: URL) {
  if (url.searchParams.has("hourly")) return archiveHoursAnswer(url);
  const latitude = Number(url.searchParams.get("latitude"));
  const first = Date.parse(url.searchParams.get("start_date") + "T00:00:00Z");
  const last = Date.parse(url.searchParams.get("end_date") + "T00:00:00Z");
  const days = Array.from(
    { length: Math.round((last - first) / (24 * HOUR)) + 1 },
    (_, i) => first + i * 24 * HOUR,
  );
  const base = 30 - latitude / 2;
  return {
    daily: {
      time: days.map((time) => iso(time).slice(0, 10)),
      temperature_2m_max: days.map((_, i) =>
        Number((base + 5 + (i % 4)).toFixed(1)),
      ),
      temperature_2m_min: days.map((_, i) =>
        Number((base - 4 - (i % 3)).toFixed(1)),
      ),
      temperature_2m_mean: days.map((_, i) =>
        Number((base + (i % 2)).toFixed(1)),
      ),
      // Every fifth day is wet, and wetter the further north the track is.
      precipitation_sum: days.map((_, i) =>
        i % 5 === 0 ? Number((latitude / 5).toFixed(1)) : 0,
      ),
      wind_speed_10m_max: days.map((_, i) => 4 + (i % 6)),
      wind_gusts_10m_max: days.map((_, i) => 9 + (i % 6)),
      wind_direction_10m_dominant: days.map(() => 240),
    },
  };
}

const RADAR = {
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: Array.from({ length: 13 }, (_, i) => ({
      time: Math.floor(TEST_TIME.getTime() / 1000) - (12 - i) * 600,
      path: `/v2/radar/${i}`,
    })),
  },
};

/** The racetrack lines OpenStreetMap has near a track the user added. */
const OUTLINE = {
  elements: [
    {
      type: "way",
      tags: { highway: "raceway" },
      geometry: [
        { lat: 27.45, lon: -81.352 },
        { lat: 27.458, lon: -81.352 },
        { lat: 27.458, lon: -81.344 },
        { lat: 27.45, lon: -81.344 },
        { lat: 27.45, lon: -81.352 },
      ],
    },
  ],
};

// A 1×1 transparent PNG for every map tile.
const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export interface Services {
  /** Hosts that answer with a server error, e.g. "api.met.no". */
  down: Set<string>;
  /** True: every outside request fails, as without a connection. */
  offline: boolean;
  /** The hosts that were asked, in order. */
  requests: string[];
}

function answer(url: URL): unknown | null {
  switch (url.hostname) {
    case "api.open-meteo.com":
      if (url.searchParams.has("minutely_15")) return rainGridAnswer(url);
      // The time zone of a track the user added.
      if (url.searchParams.get("timezone") === "auto")
        return {
          timezone:
            Number(url.searchParams.get("longitude")) < -30
              ? "America/New_York"
              : "Europe/Paris",
        };
      return openMeteoAnswer(url);
    case "overpass-api.de":
      return OUTLINE;
    case "archive-api.open-meteo.com":
      return archiveAnswer(url);
    case "api.met.no":
      return metNorwayAnswer();
    case "api.brightsky.dev":
      // The DWD's stations thin out away from Europe.
      return Number(url.searchParams.get("lat")) > 35
        ? brightSkyAnswer()
        : null;
    case "opendataapi.dmi.dk":
      return dmiAnswer(url);
    case "dataset.api.hub.geosphere.at":
      return geosphereAnswer();
    case "api.weather.gov":
      if (url.pathname.startsWith("/gridpoints/")) return nwsGridAnswer();
      // Only the United States east of the Rockies, for the tests.
      return Number(url.pathname.split(",")[1]) > -100
        ? { properties: { forecastGridData: NWS_GRID } }
        : null;
    case "api.rainviewer.com":
      return RADAR;
    default:
      return null;
  }
}

async function serve(route: Route, services: Services) {
  const url = new URL(route.request().url());
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    return route.continue();
  services.requests.push(url.hostname);
  if (services.offline) return route.abort("internetdisconnected");
  if (services.down.has(url.hostname))
    return route.fulfill({ status: 503, body: "" });
  if (/^(tile|tiles|tilecache)\./.test(url.hostname))
    return route.fulfill({ body: TILE, contentType: "image/png" });
  const data = answer(url);
  if (data !== null) return route.fulfill({ json: data });
  // A service that is asked but has nothing for the place says 404; any other
  // address is not allowed out at all.
  return /\.(gov|se|fi|dev)$/.test(url.hostname)
    ? route.fulfill({ status: 404, body: "" })
    : route.abort();
}

export const test = base.extend<{
  services: Services;
  /** True to start like a first launch, with the set-up dialog. */
  firstRun: boolean;
}>({
  firstRun: [false, { option: true }],
  services: async ({ context, firstRun }, provide) => {
    const services: Services = {
      down: new Set(),
      offline: false,
      requests: [],
    };
    await context.route("**/*", (route) => serve(route, services));
    if (!firstRun)
      // As if set up before, in °C and km/h. Only when nothing is saved yet,
      // so what a test changes is still there after a reload.
      await context.addInitScript(() => {
        if (localStorage.getItem("pitwall-welcomed")) return;
        localStorage.setItem("pitwall-welcomed", "1");
        localStorage.setItem(
          "pitwall-units",
          JSON.stringify({ temperature: "c", wind: "kmh" }),
        );
      });
    await provide(services);
  },
  page: async ({ page, services: _services }, provide) => {
    await page.clock.setFixedTime(TEST_TIME);
    await provide(page);
  },
});

/** Pick a track with whichever control the layout shows. */
export async function selectTrack(page: Page, name: string) {
  const select = page.getByRole("combobox", { name: "Track", exact: true });
  if (await select.isVisible()) return select.selectOption({ label: name });
  // The list is folded away until it is asked for.
  const list = page.getByRole("list", { name: "Tracks" });
  if (!(await list.isVisible()))
    await page.getByRole("button", { name: "Choose another track" }).click();
  await list.getByRole("button", { name }).click();
}

export async function openPage(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name })
    .click();
}

export { expect };
