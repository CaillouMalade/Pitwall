// The providers on saved sample answers, with fetch swapped for a fake.

import assert from "node:assert/strict";
import { test } from "node:test";
import { metNorway, openMeteo, radarFrames } from "../web/src/lib/providers.ts";
import { windKmh } from "../web/src/lib/stats.ts";
import { sumRain, windowStart } from "../web/src/lib/windows.ts";
import { fakeFetch, fixture, json, status, utc } from "./helpers.ts";

const MONZA = { name: "Monza", latitude: 45.62, longitude: 9.28 };
// A fixed "now" inside the sample period, so the tests never depend on today's date.
const NOW = utc(2026, 11, 15, 22, 10);
const close = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-9,
    `${actual} ≈ ${expected}`,
  );

async function run(provider: typeof openMeteo, data: unknown, now = NOW) {
  const fetch = fakeFetch(json(data));
  const points = await provider(fetch).forecast(MONZA, now);
  return { points, url: new globalThis.URL(fetch.calls[0].url), fetch };
}

test("window start and rain sums", () => {
  assert.equal(windowStart(utc(2026, 11, 15, 14, 20)), utc(2026, 11, 15, 12));
  close(sumRain([0.4, 0.4, 1.4]), 2.2);
  assert.equal(sumRain([0.4, null, 1.4]), null);
});

test("Open-Meteo windows, units and rain", async () => {
  const { points, url } = await run(openMeteo, fixture("open-meteo.json"));
  // 18:00 is before the current window (21:00) and 09:00 has no 3 hours after it.
  assert.deepEqual(
    points.map((point) => point.time),
    [
      utc(2026, 11, 15, 21),
      utc(2026, 11, 16, 0),
      utc(2026, 11, 16, 3),
      utc(2026, 11, 16, 6),
    ],
  );
  const [first] = points;
  assert.equal(first.source, "open-meteo");
  assert.equal(first.temperature, 7.1);
  assert.equal(first.windSpeed, 0.61);
  close(windKmh(first), 2.196);
  assert.equal(first.windDeg, 81);
  // Rain 21:00-00:00 is the values at 22:00, 23:00 and 00:00.
  close(first.rain, 0.1);
  // Rain 00:00-03:00 is the values at 01:00, 02:00 and 03:00.
  close(points[1].rain, 2.2);
  assert.equal(url.searchParams.get("wind_speed_unit"), "ms");
  assert.equal(url.searchParams.get("timezone"), "UTC");
  assert.equal(url.searchParams.get("appid"), null);
});

test("Open-Meteo unreadable answer", async () => {
  await assert.rejects(
    run(openMeteo, { hourly: { time: ["2026-11-15T21:00"] } }),
    { message: "Open-Meteo sent a forecast in an unexpected format." },
  );
  await assert.rejects(run(openMeteo, []), /unexpected format/);
});

test("Open-Meteo rejects a bad location before calling", async () => {
  await assert.rejects(
    openMeteo(fakeFetch(json({}))).forecast(
      { name: "Nowhere", latitude: "abc" as unknown as number, longitude: 9 },
      NOW,
    ),
    /invalid coordinates/,
  );
});

test("MET Norway windows, units and rain", async () => {
  const { points, url } = await run(metNorway, fixture("met-norway.json"));
  assert.deepEqual(
    points.map((point) => point.time),
    [
      utc(2026, 11, 15, 21),
      utc(2026, 11, 16, 0),
      utc(2026, 11, 16, 3),
      utc(2026, 11, 16, 6),
    ],
  );
  const [first] = points;
  assert.equal(first.source, "met-norway");
  assert.equal(first.temperature, 5.5);
  assert.equal(first.windSpeed, 1.0);
  assert.equal(first.windDeg, 12.8);
  // Rain 00:00-03:00 is next_1_hours at 00:00, 01:00 and 02:00: 0.0 + 0.2 + 0.0.
  close(points[1].rain, 0.2);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
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
  const url = new globalThis.URL(fetch.calls[0].url);
  assert.equal(url.searchParams.get("lat"), "45.6191");
  assert.equal(url.searchParams.get("lon"), "9.2823");
});

test("MET Norway skips windows without three hourly values", async () => {
  const data = fixture<{
    properties: { timeseries: { data: Record<string, unknown> }[] };
  }>("met-norway.json");
  const { timeseries } = data.properties;
  // Like further out in a real answer: 01:00 has no hourly rain, 04:00 is missing.
  delete timeseries[7].data.next_1_hours;
  timeseries.splice(10, 1);
  const { points } = await run(metNorway, data);
  assert.deepEqual(
    points.map((point) => point.time),
    [utc(2026, 11, 15, 21), utc(2026, 11, 16, 6)],
  );
});

test("MET Norway unreadable answer", async () => {
  await assert.rejects(run(metNorway, { properties: {} }), {
    message: "MET Norway sent a forecast in an unexpected format.",
  });
});

test("both providers give the same windows", async () => {
  const a = await run(openMeteo, fixture("open-meteo.json"));
  const b = await run(metNorway, fixture("met-norway.json"));
  assert.ok(a.points.length > 0);
  assert.deepEqual(
    a.points.map((point) => point.time),
    b.points.map((point) => point.time),
  );
});

test("each provider keeps 5 days from the current window", async () => {
  const start = utc(2026, 11, 16);
  const hours = 6 * 24 + 4;
  const time = Array.from({ length: hours }, (_, i) =>
    new Date(start + i * 3_600_000).toISOString().slice(0, 16),
  );
  const values = time.map(() => 1);
  const { points } = await run(
    openMeteo,
    {
      hourly: {
        time,
        temperature_2m: values,
        wind_speed_10m: values,
        wind_direction_10m: values,
        precipitation: values,
      },
    },
    start + 3_600_000,
  );
  assert.equal(points.length, 40); // 5 days × 8 windows
  assert.equal(points[0].time, start);
  assert.equal(points.at(-1)!.time, start + 5 * 24 * 3_600_000 - 3 * 3_600_000);
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
    radarFrames(fakeFetch(json({ host: "https://x", radar: { past: [] } }))),
    {
      message: "RainViewer sent its radar list in an unexpected format.",
    },
  );
});

test("a radar server error uses the shared message", async () => {
  await assert.rejects(
    radarFrames(fakeFetch(status(503))),
    /problem on its side/,
  );
});
