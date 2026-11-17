// Past weather: the archive's answer for any place, and the bundled log it
// falls back on. Fake answers only; nothing here touches the network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GRADE1_TRACKS } from "../web/src/data/grade1-tracks.ts";
import { fetchHistory } from "../web/src/lib/history-source.ts";
import {
  MIN_DAYS,
  observedDays,
  onDays,
  parseObservations,
  rankByRain,
  sharedDays,
  summarise,
  type DailyWeather,
  type Observation,
  type TrackHistory,
} from "../web/src/lib/history.ts";
import { fakeFetch, fixtureText, json, status, utc } from "./helpers.ts";

const sample = () => parseObservations(fixtureText("track-sample.csv"));
const round = (value: number, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

// The archive

const SEBRING = { name: "Sebring", latitude: 27.45471, longitude: -81.3483 };
const NOW = utc(2026, 11, 17, 9, 20);

const ARCHIVE = {
  daily: {
    time: ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"],
    temperature_2m_max: [24.5, 26, 22.1, null],
    temperature_2m_min: [14.5, 18, 15.1, null],
    temperature_2m_mean: [19, 22, 18, null],
    precipitation_sum: [0, 12.4, 0.3, null],
    wind_speed_10m_max: [5.5, 9, 4, null],
  },
};

test("the archive is asked for the days before today, for any place", async () => {
  const fetch = fakeFetch(json(ARCHIVE));
  const days = await fetchHistory(SEBRING, 4, NOW, fetch);
  const { searchParams, origin, pathname } = new globalThis.URL(
    fetch.calls[0].url,
  );
  assert.equal(
    origin + pathname,
    "https://archive-api.open-meteo.com/v1/archive",
  );
  assert.equal(searchParams.get("latitude"), "27.4547");
  assert.equal(searchParams.get("longitude"), "-81.3483");
  // Today is 17 November: the 4 days before it, ending yesterday.
  assert.equal(searchParams.get("start_date"), "2026-11-13");
  assert.equal(searchParams.get("end_date"), "2026-11-16");
  assert.equal(searchParams.get("wind_speed_unit"), "ms");
  assert.equal(searchParams.get("timezone"), "UTC");
  // The newest day is still empty in the archive, so it is left out.
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-11-13", "2026-11-14", "2026-11-15"],
  );
  assert.deepEqual(days[1], {
    day: "2026-11-14",
    temperatureMin: 18,
    temperatureMax: 26,
    temperatureMean: 22,
    rain: 12.4,
    temperatureRange: 8,
    windMax: 9,
  });
});

test("an archive without a single day, or unreadable, is a failure", async () => {
  const empty = {
    daily: Object.fromEntries(
      Object.entries(ARCHIVE.daily).map(([name, values]) => [
        name,
        name === "time" ? values : values.map(() => null),
      ]),
    ),
  };
  const message = "The weather archive sent an answer in an unexpected format.";
  await assert.rejects(fetchHistory(SEBRING, 4, NOW, fakeFetch(json(empty))), {
    message,
  });
  await assert.rejects(
    fetchHistory(SEBRING, 4, NOW, fakeFetch(json({ daily: { time: [1] } }))),
    { message },
  );
  await assert.rejects(
    fetchHistory(SEBRING, 4, NOW, fakeFetch(status(503))),
    /problem on its side/,
  );
});

test("the archive stops a bad place before any request", async () => {
  const fetch = fakeFetch(json(ARCHIVE));
  await assert.rejects(
    fetchHistory(
      { name: "Nowhere", latitude: 95, longitude: 0 },
      4,
      NOW,
      fetch,
    ),
    /outside the valid range/,
  );
  assert.equal(fetch.calls.length, 0);
});

// Summaries and comparison

const daily = (
  day: string,
  rain: number | null,
  mean: number | null = 10,
  wind: number | null = null,
): DailyWeather => ({
  day,
  temperatureMin: mean === null ? null : mean - 4,
  temperatureMax: mean === null ? null : mean + 4,
  temperatureMean: mean,
  rain,
  temperatureRange: mean === null ? null : 8,
  windMax: wind,
});

test("a summary counts rain days from 1 mm", () => {
  const summary = summarise("sebring", "Sebring", [
    daily("2026-11-13", 0, 19, 5.5),
    daily("2026-11-14", 12.4, 22, 9),
    daily("2026-11-15", 0.3, 18, 4),
    daily("2026-11-16", 1, null, null),
  ]);
  assert.equal(round(summary.averageTemperature!), 19.67);
  assert.equal(summary.rainDays, 2);
  assert.equal(round(summary.totalRain), 13.7);
  assert.equal(summary.days, 4);
  assert.equal(summary.strongestWind, 9);
  assert.equal(
    String(summary),
    "Sebring: average 19.7 °C, 2 rain days, 13.7 mm total rain over 4 days.",
  );
});

test("a summary without values says so", () => {
  const summary = summarise("x", "X", [daily("2026-11-13", null, null)]);
  assert.equal(summary.averageTemperature, null);
  assert.equal(summary.totalRain, 0);
  assert.equal(summary.rainDays, 0);
  assert.equal(summary.strongestWind, null);
  assert.match(String(summary), /no temperature/);
});

test("tracks are ranked wettest first, keeping the order of a tie", () => {
  const summaries = rankByRain([
    summarise("a", "A", [daily("2026-11-13", 2)]),
    summarise("b", "B", [daily("2026-11-13", 9)]),
    summarise("c", "C", [daily("2026-11-13", 2)]),
  ]);
  assert.deepEqual(
    summaries.map((summary) => summary.track),
    ["B", "A", "C"],
  );
});

const history = (trackId: string, days: string[]): TrackHistory => ({
  trackId,
  origin: "archive",
  days: days.map((day) => daily(day, 1)),
});

test("tracks are compared on the days they all have", () => {
  const a = history("a", ["2026-11-01", "2026-11-02", "2026-11-03"]);
  const b = history("b", ["2026-11-03", "2026-11-02", "2026-11-09"]);
  const days = sharedDays([a, b]);
  assert.deepEqual(days, ["2026-11-02", "2026-11-03"]);
  assert.deepEqual(
    onDays(a, days).map((day) => day.day),
    ["2026-11-02", "2026-11-03"],
  );
  assert.deepEqual(sharedDays([a, history("c", ["2026-12-01"])]), []);
  assert.deepEqual(
    sharedDays([a]),
    a.days.map((day) => day.day),
  );
  assert.deepEqual(sharedDays([]), []);
});

// The bundled log, used when the archive cannot be reached

test("the bundled observations load", () => {
  const log = parseObservations(
    readFileSync(
      new URL("../web/src/data/observed-weather.csv", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(log.length > 1000);
  assert.ok(log.every((row) => row.trackId && Number.isFinite(row.time)));
  assert.ok(log.some((row) => row.rain !== null));
  assert.ok(observedDays(log, "monza").length >= MIN_DAYS);
  // Every track id in the log that the app knows is a built-in circuit's.
  const builtIn = new Set(GRADE1_TRACKS.map((track) => track.id));
  assert.ok(builtIn.has("monza") && builtIn.has("spa"));
  // The 6 circuits added last only have one reading: not enough to draw.
  for (const id of [
    "red-bull-ring",
    "hockenheim",
    "hungaroring",
    "mugello",
    "zandvoort",
    "valencia",
  ])
    assert.ok(observedDays(log, id).length < MIN_DAYS, id);
  // A track the user added is not in the log at all.
  assert.deepEqual(observedDays(log, "sebring"), []);
});

test("an empty or headerless file is no history", () => {
  assert.deepEqual(parseObservations(""), []);
  assert.deepEqual(parseObservations("a,b\n1,2"), []);
});

test("logged days estimate rain and find the temperature range", () => {
  const days = observedDays(sample(), "imola");
  assert.equal(round(days[0].rain!), 10.32);
  assert.deepEqual(
    days.map((day) => day.temperatureRange),
    [0],
  );
  assert.equal(days[0].windMax, null);
  assert.deepEqual(observedDays(sample(), "no-such-track"), []);
});

test("a logged day's summary", () => {
  const summary = summarise("imola", "Imola", observedDays(sample(), "imola"));
  assert.equal(summary.averageTemperature, 9.03);
  assert.equal(summary.rainDays, 1);
  assert.equal(round(summary.totalRain), 10.32);
  assert.equal(summary.days, 1);
  assert.equal(summary.strongestWind, null);
});

test("missing rain in the log becomes 0 mm", () => {
  const log = sample().map((row) =>
    row.trackId === "imola" ? { ...row, rain: null } : row,
  );
  assert.equal(observedDays(log, "imola")[0].rain, 0);
});

const at = (date: string, hour: number): number =>
  Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
const row = (
  trackId: string,
  time: number,
  temperature: number,
  rain: number | null = 0,
): Observation => ({
  trackId,
  track: trackId.toUpperCase(),
  time,
  temperature,
  rain,
});

test("daily min, max and swing from the log", () => {
  const log = [
    row("a", at("2026-11-02", 3), 6, 0),
    row("a", at("2026-11-01", 3), 4, 0.5),
    row("a", at("2026-11-01", 15), 14, null),
    row("b", at("2026-11-01", 15), 30, 9),
  ];
  const days = observedDays(log, "a");
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-11-01", "2026-11-02"],
  );
  assert.equal(days[0].temperatureMin, 4);
  assert.equal(days[0].temperatureMax, 14);
  assert.equal(days[0].temperatureMean, 9);
  assert.equal(days[0].temperatureRange, 10);
  assert.equal(days[0].rain, 6); // mean 0.25 mm × 24
});

test("a file saved with a byte-order mark still reads", () => {
  const text =
    "\uFEFF" + fixtureText("track-sample.csv").replace(/\n/g, "\r\n");
  assert.equal(parseObservations(text).length, sample().length);
});
