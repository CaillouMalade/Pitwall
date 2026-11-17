import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  compareTrackHistory,
  daysLogged,
  historyTracks,
  parseObservations,
  sharedPeriod,
  trackRainHistory,
  type Observation,
} from "../web/src/lib/history.ts";
import { fixtureText } from "./helpers.ts";

const sample = () => parseObservations(fixtureText("track-sample.csv"));
const round = (value: number, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

test("the bundled observations load", () => {
  const history = parseObservations(
    readFileSync(
      new URL("../web/src/data/observed-weather.csv", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(history.length > 1000);
  assert.ok(history.every((row) => row.trackId && Number.isFinite(row.time)));
  assert.ok(history.some((row) => row.rain !== null));
  // The 6 circuits added last only have one reading: not enough history yet.
  const ids = historyTracks(history).map((track) => track.id);
  assert.ok(ids.includes("monza"));
  for (const id of [
    "red-bull-ring",
    "hockenheim",
    "hungaroring",
    "mugello",
    "zandvoort",
    "valencia",
  ])
    assert.ok(!ids.includes(id), id);
});

test("an empty or headerless file is no history", () => {
  assert.deepEqual(parseObservations(""), []);
  assert.deepEqual(parseObservations("a,b\n1,2"), []);
});

test("daily history estimates rain and finds the temperature range", () => {
  const daily = trackRainHistory(sample(), "imola");
  assert.equal(round(daily[0].rain), 10.32);
  assert.deepEqual(
    daily.map((day) => day.temperatureRange),
    [0],
  );
});

test("days logged counts different days", () => {
  assert.equal(daysLogged(sample(), "imola"), 1);
  assert.equal(daysLogged(sample(), "no-such-track"), 0);
});

test("track comparison ranks and counts rain days", () => {
  const summaries = compareTrackHistory(sample(), ["imola", "monza"]);
  assert.deepEqual(
    summaries.map((summary) => summary.track),
    ["Monza", "Imola"],
  );
  const imola = summaries[1];
  assert.equal(imola.averageTemperature, 9.03);
  assert.equal(imola.rainDays, 1);
  assert.equal(round(imola.totalRain), 10.32);
  assert.equal(imola.daysLogged, 1);
  assert.equal(
    String(imola),
    "Imola: average 9.0 °C, 1 rain days, 10.3 mm total rain over 1 logged days.",
  );
});

test("a day under 0.1 mm is not a rain day", () => {
  // 0.002 mm per hour on average, so about 0.05 mm over the day.
  const history = sample().map((row) =>
    row.trackId === "imola" ? { ...row, rain: 0.002 } : row,
  );
  const [imola] = compareTrackHistory(history, ["imola"]);
  assert.ok(imola.totalRain > 0);
  assert.equal(imola.rainDays, 0);
});

test("missing rain becomes 0 mm", () => {
  const history = sample().map((row) =>
    row.trackId === "imola" ? { ...row, rain: null } : row,
  );
  assert.equal(trackRainHistory(history, "imola")[0].rain, 0);
});

const day = (date: string, hour: number): number =>
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

test("tracks need two logged days and keep their first-seen order", () => {
  const history = [
    row("b", day("2026-11-01", 1), 5),
    row("a", day("2026-11-01", 1), 5),
    row("a", day("2026-11-02", 1), 5),
    row("b", day("2026-11-03", 1), 5),
    row("c", day("2026-11-03", 1), 5),
  ];
  assert.deepEqual(historyTracks(history), [
    { id: "b", name: "B" },
    { id: "a", name: "A" },
  ]);
});

test("the shared period keeps only the overlap", () => {
  const history = [
    row("a", day("2026-11-01", 1), 1),
    row("a", day("2026-11-05", 1), 1),
    row("b", day("2026-11-03", 1), 1),
    row("b", day("2026-11-09", 1), 1),
  ];
  const shared = sharedPeriod(history, ["a", "b"])!;
  assert.deepEqual(
    shared.map((item) => item.time),
    [day("2026-11-05", 1), day("2026-11-03", 1)],
  );
  assert.equal(
    sharedPeriod([row("a", 1, 1), row("b", 5, 1), row("a", 2, 1)], ["a", "b"]),
    null,
  );
  assert.equal(sharedPeriod(history, ["a", "missing"]), null);
});

test("daily min, max and swing", () => {
  const history = [
    row("a", day("2026-11-01", 3), 4, 0.5),
    row("a", day("2026-11-01", 15), 14, null),
    row("a", day("2026-11-02", 3), 6, 0),
  ];
  const daily = trackRainHistory(history, "a");
  assert.equal(daily.length, 2);
  assert.equal(daily[0].temperatureMin, 4);
  assert.equal(daily[0].temperatureMax, 14);
  assert.equal(daily[0].temperatureMean, 9);
  assert.equal(daily[0].temperatureRange, 10);
  assert.equal(daily[0].rain, 6); // mean 0.25 mm × 24
});

test("a file saved with a byte-order mark still reads", () => {
  const text = "﻿" + fixtureText("track-sample.csv").replace(/\n/g, "\r\n");
  assert.equal(parseObservations(text).length, sample().length);
});
