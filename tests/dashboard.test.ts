// The page helpers on the invented forecast. Its 8 hours are Friday 13 November
// 2026, every 3 hours from 00:00 to 21:00 UTC, and every source says 225° (SW).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agreementText,
  rainText,
  rangeText,
  sessionMessage,
  sourceRows,
  sourcesText,
} from "../web/src/lib/dashboard.ts";
import { niceTicks, unitFormat } from "../web/src/lib/format.ts";
import {
  combineForecasts,
  combineWindow,
  periodPoints,
} from "../web/src/lib/stats.ts";
import {
  compassSector,
  directionVote,
  meanDirection,
  voteText,
} from "../web/src/lib/wind.ts";
import { fakeTable, utc } from "./helpers.ts";

const FP1 = utc(2026, 11, 13, 6);
const FP1_END = utc(2026, 11, 13, 7);
const fp1Rows = () => periodPoints(fakeTable(), FP1, FP1_END);
const metric = unitFormat({ temperature: "c", wind: "kmh" });

test("compass sector of the main directions", () => {
  assert.equal(compassSector(0), "N");
  assert.equal(compassSector(90), "E");
  assert.equal(compassSector(180), "S");
  assert.equal(compassSector(225), "SW");
  assert.equal(compassSector(270), "W");
});

test("compass sector on both sides of north", () => {
  assert.equal(compassSector(350), "N");
  assert.equal(compassSector(10), "N");
  assert.equal(compassSector(360), "N");
});

test("direction vote with a disagreement and a missing value", () => {
  // Two say N, one says E, one sent no direction.
  assert.deepEqual(directionVote([350, 10, 90, null]), {
    sector: "N",
    agreeing: 2,
    of: 3,
  });
  assert.equal(voteText(directionVote([225, 225, 225])!), "3 of 3 agree");
});

test("direction vote with no direction", () => {
  assert.equal(directionVote([null, null]), null);
  assert.equal(directionVote([]), null);
});

test("mean direction across north", () => {
  assert.ok(Math.abs(meanDirection([350, 10])!) < 1e-6);
  assert.ok(Math.abs(meanDirection([80, 100])! - 90) < 1e-6);
  assert.equal(meanDirection([]), null);
  assert.equal(meanDirection([90, 270]), null);
});

test("the rows of a session are its hours, one per source", () => {
  const rows = fp1Rows();
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.temperature),
    [10, 10, 11],
  );
});

test("session message", () => {
  const rows = fp1Rows();
  const thursday = utc(2026, 11, 12, 10);
  const saturday = utc(2026, 11, 14, 10);
  assert.equal(sessionMessage(FP1_END, thursday, rows), null);
  assert.equal(
    sessionMessage(FP1_END, saturday, rows),
    "This session is over.",
  );
  assert.equal(
    sessionMessage(FP1_END, thursday, []),
    "No forecast reaches this session yet.",
  );
  // A session that is under way is not over yet.
  assert.equal(sessionMessage(FP1_END, utc(2026, 11, 13, 6, 30), rows), null);
});

test("source rows for FP1, one group per centre", () => {
  const groups = sourceRows(fp1Rows());
  assert.deepEqual(
    groups.map((group) => [group.centre, group.rows.map((row) => row.label)]),
    [
      ["NOAA", ["NOAA GFS"]],
      ["DWD", ["DWD ICON"]],
      ["ECMWF", ["MET Norway"]],
    ],
  );
  const rows = groups.flatMap((group) => group.rows);
  // 06:00: wind 5 m/s for every source, from 225° (SW).
  assert.deepEqual(
    rows.map((row) => row.windSpeed),
    [5, 5, 5],
  );
  assert.deepEqual(
    rows.map((row) => row.windFrom),
    ["SW", "SW", "SW"],
  );
  // The service is named where its name says more than the source's.
  assert.deepEqual(
    rows.map((row) => row.via),
    ["Open-Meteo", "Open-Meteo", null],
  );
});

test("source rows keep the sources of one centre together", () => {
  const row = (source: string) => ({
    source,
    time: 0,
    temperature: 10,
    rain: null,
    windSpeed: 2,
    windDeg: null,
  });
  const groups = sourceRows([
    row("ecmwf-ifs"),
    row("dwd-icon"),
    row("ecmwf-aifs"),
  ]);
  assert.deepEqual(
    groups.map((group) => [
      group.centre,
      group.rows.map((item) => item.source),
    ]),
    [
      ["ECMWF", ["ecmwf-ifs", "ecmwf-aifs"]],
      ["DWD", ["dwd-icon"]],
    ],
  );
  assert.equal(groups[0].rows[0].windFrom, null);
  assert.equal(groups[0].rows[0].rain, null);
});

test("range text: a range from three centres, both values with two", () => {
  const [first] = combineForecasts(fakeTable());
  assert.equal(
    rangeText(first.temperature, "°C", metric.temperatureNumber),
    "Range 9.0 to 9.8 °C",
  );
  const [two] = combineForecasts(fakeTable().slice(0, 16));
  assert.equal(
    rangeText(two.temperature, "°C", metric.temperatureNumber),
    "9.0 and 10.0 °C",
  );
  const [one] = combineForecasts(fakeTable().slice(0, 1));
  assert.equal(
    rangeText(one.temperature, "°C", metric.temperatureNumber),
    "One source",
  );
  assert.equal(
    rangeText(one.rain, "mm", (value) => value.toFixed(1)),
    "One source",
  );
});

test("range text in the chosen units", () => {
  const imperial = unitFormat({ temperature: "f", wind: "mph" });
  const [first] = combineForecasts(fakeTable());
  // 9 to 9.8 °C is 48.2 to 49.6 °F.
  assert.equal(
    rangeText(first.temperature, "°F", imperial.temperatureNumber),
    "Range 48.2 to 49.6 °F",
  );
  // 3.2 to 4 m/s is 7 to 9 mph.
  assert.equal(
    rangeText(first.wind, "mph", imperial.windNumber),
    "Range 7 to 9 mph",
  );
});

test("rain text counts the centres that expect rain", () => {
  const combined = combineForecasts(fakeTable());
  assert.equal(rainText(combined[0]), "0 of 3 expect rain");
  assert.equal(rainText(combined[6]), "1 of 3 expect rain");
  assert.equal(rainText(combined[4]), "3 of 3 expect rain");
  const none = combineWindow(0, [
    {
      source: "smhi",
      time: 0,
      temperature: 3,
      windSpeed: null,
      windDeg: null,
      rain: null,
    },
  ]);
  assert.equal(rainText(none), "No value");
});

test("sources text", () => {
  const [first] = combineForecasts(fakeTable());
  assert.equal(sourcesText(first), "3 sources");
  const row = (source: string) => ({
    source,
    time: 0,
    temperature: 1,
    windSpeed: null,
    windDeg: null,
    rain: null,
  });
  assert.equal(
    sourcesText(combineWindow(0, [row("ecmwf-ifs"), row("ecmwf-aifs")])),
    "2 sources from 1 centre",
  );
  assert.equal(
    sourcesText(
      combineWindow(0, [row("ecmwf-ifs"), row("ecmwf-aifs"), row("ukmo")]),
    ),
    "3 sources from 2 centres",
  );
  assert.equal(sourcesText(combineWindow(0, [row("ukmo")])), "1 source");
});

test("axis ticks are round, even and hold both ends", () => {
  assert.deepEqual(niceTicks(3.2, 9.7), [2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(0, 1, 3), [0, 0.5, 1]);
  assert.deepEqual(niceTicks(0, 11.6, 3), [0, 5, 10, 15]);
  assert.deepEqual(niceTicks(-3.5, 4), [-4, -2, 0, 2, 4]);
  assert.deepEqual(niceTicks(5, 5), [5]);
});

test("agreement text names what the forecasts are apart on", () => {
  const grades = (
    rain: "high" | "medium" | "low" | "unknown",
    temperature: typeof rain,
    wind: typeof rain,
    overall: typeof rain,
  ) => ({ rain, temperature, wind, overall });
  assert.equal(
    agreementText(grades("high", "high", "high", "high")),
    "Forecasts agree",
  );
  // A dry session with a wide temperature range is not a doubtful rain forecast.
  assert.equal(
    agreementText(grades("high", "low", "high", "low")),
    "Forecasts disagree on temperature",
  );
  assert.equal(
    agreementText(grades("low", "medium", "low", "low")),
    "Forecasts disagree on rain and wind",
  );
  assert.equal(
    agreementText(grades("high", "medium", "unknown", "medium")),
    "Some spread in temperature",
  );
  assert.equal(
    agreementText(grades("low", "low", "low", "low")),
    "Forecasts disagree",
  );
  assert.equal(
    agreementText(grades("unknown", "unknown", "unknown", "unknown")),
    "Too few forecasts",
  );
});
