// The statistics on invented forecasts, never on real API calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { centreOf, inNordicArea, SOURCES } from "../web/src/lib/sources.ts";
import {
  byCentre,
  combineForecasts,
  combineWindow,
  estimate,
  median,
  MIN_FOR_RANGE,
  quantile,
  RAIN_THRESHOLD_MM,
} from "../web/src/lib/stats.ts";
import type { ForecastPoint } from "../web/src/lib/types.ts";
import { fakeForecasts, fakeTable } from "./helpers.ts";

const near = (actual: number | null, expected: number, digits = 9) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 10 ** -digits,
    `${actual} ≈ ${expected}`,
  );

/** One window with one source per value, each its own centre. */
function points(
  values: Partial<ForecastPoint>[],
  sources = values.map((_, i) => `source-${i}`),
): ForecastPoint[] {
  return values.map((value, i) => ({
    source: sources[i],
    time: 0,
    temperature: null,
    windSpeed: null,
    windDeg: null,
    rain: null,
    ...value,
  }));
}

// The pieces

test("quantile between neighbours, by hand", () => {
  const values = [1, 2, 3, 4, 5];
  assert.equal(quantile(values, 0), 1);
  assert.equal(quantile(values, 0.5), 3);
  assert.equal(quantile(values, 1), 5);
  // A tenth of the way along 4 gaps is 0.4 of the way from 1 to 2.
  near(quantile(values, 0.1), 1.4);
  near(quantile(values, 0.9), 4.6);
  near(quantile([10, 20], 0.5), 15);
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([7]), 7);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("an estimate is the median and the middle 80%", () => {
  const value = estimate([12, 10, 11, 14, 13]);
  assert.equal(value.value, 12);
  near(value.low, 10.4);
  near(value.high, 13.6);
  assert.deepEqual(value.values, [10, 11, 12, 13, 14]);
});

test("the median shrugs off one source far from the others", () => {
  // A mean would say 12.6 °C; the middle of the five stays at 8.
  assert.equal(estimate([7, 8, 8, 9, 31]).value, 8);
});

test("a range needs three values", () => {
  assert.equal(MIN_FOR_RANGE, 3);
  const two = estimate([10, 9]);
  assert.equal(two.value, 9.5);
  assert.equal(two.low, null);
  assert.equal(two.high, null);
  assert.deepEqual(two.values, [9, 10]);
  const one = estimate([9]);
  assert.equal(one.value, 9);
  assert.equal(one.low, null);
  const three = estimate([9, 10, 9]);
  near(three.low, 9);
  near(three.high, 9.8);
});

test("missing values are left out", () => {
  const value = estimate([10, null, 12, null]);
  assert.equal(value.value, 11);
  assert.deepEqual(value.values, [10, 12]);
  assert.deepEqual(estimate([null, null]), {
    value: null,
    low: null,
    high: null,
    values: [],
  });
});

test("values that agree give a range of no width", () => {
  const value = estimate([9, 9, 9, 9]);
  assert.equal(value.low, 9);
  assert.equal(value.high, 9);
});

// Combining

test("one entry per window, oldest first", () => {
  const combined = combineForecasts(fakeTable());
  assert.equal(combined.length, 8);
  assert.deepEqual(
    combined.map((window) => [window.sources, window.centres]),
    Array(8).fill([3, 3]),
  );
  assert.deepEqual(
    combined.map((window) => window.time),
    [...combined.map((window) => window.time)].sort((a, b) => a - b),
  );
});

test("first window, by hand", () => {
  // 9, 10 and 9 °C from three centres: median 9, range 9 to 9.8.
  const [first] = combineForecasts(fakeTable());
  assert.equal(first.temperature.value, 9);
  near(first.temperature.low, 9);
  near(first.temperature.high, 9.8);
  // 4, 3 and 4 m/s.
  assert.equal(first.wind.value, 4);
  assert.deepEqual(first.direction, { sector: "SW", agreeing: 3, of: 3 });
});

test("rain: centres expecting at least the threshold", () => {
  assert.equal(RAIN_THRESHOLD_MM, 0.2);
  const combined = combineForecasts(fakeTable());
  // Hour 2 has 0, 0.1 and 0 mm; hour 3 has 0.4, 0.6 and 0.2 mm; hour 6 has 0, 0 and 0.2 mm.
  assert.deepEqual(
    combined.map((window) => window.rainVotes),
    [0, 0, 0, 3, 3, 3, 1, 0],
  );
  assert.ok(combined.every((window) => window.rainVoters === 3));
  assert.equal(combined[3].rain.value, 0.4);
});

test("0.1 mm and 1.3 mm is one of two, not a 100% chance of rain", () => {
  const window = combineWindow(0, points([{ rain: 0.1 }, { rain: 1.3 }]));
  assert.equal(window.rainVotes, 1);
  assert.equal(window.rainVoters, 2);
  near(window.rain.value, 0.7);
  assert.equal(window.rain.low, null);
});

test("a source without rain is not a vote against rain", () => {
  const window = combineWindow(
    0,
    points([{ rain: null, temperature: 10 }, { rain: 0.6 }]),
  );
  assert.equal(window.rainVotes, 1);
  assert.equal(window.rainVoters, 1);
  assert.equal(window.sources, 2);
});

test("nothing ever goes below zero for rain or wind", () => {
  for (const window of combineForecasts(fakeTable())) {
    assert.ok(window.rain.low! >= 0);
    assert.ok(window.wind.low! >= 0);
  }
});

test("one source gives its value without a range", () => {
  const combined = combineForecasts(fakeForecasts()["met-norway"]);
  assert.deepEqual(
    combined.map((window) => window.centres),
    Array(8).fill(1),
  );
  assert.equal(combined[0].temperature.value, 9);
  assert.equal(combined[0].temperature.low, null);
});

test("no forecast gives no windows", () => {
  assert.deepEqual(combineForecasts([]), []);
});

test("the input is not changed", () => {
  const table = fakeTable();
  const before = structuredClone(table);
  combineForecasts(table);
  assert.deepEqual(table, before);
});

// Related sources

test("sources of one centre are merged before anything is combined", () => {
  // ECMWF's two models say 10 and 12 °C; DWD says 20, the Met Office 21.
  const rows = points(
    [
      { temperature: 10 },
      { temperature: 12 },
      { temperature: 20 },
      { temperature: 21 },
    ],
    ["ecmwf-ifs", "ecmwf-aifs", "dwd-icon", "ukmo"],
  );
  assert.deepEqual(
    byCentre(rows).map((item) => [item.centre, item.temperature]),
    [
      ["ECMWF", 11],
      ["DWD", 20],
      ["Met Office", 21],
    ],
  );
  const window = combineWindow(0, rows);
  assert.equal(window.sources, 4);
  assert.equal(window.centres, 3);
  // The median of 11, 20 and 21; counting ECMWF twice would give 16.
  assert.equal(window.temperature.value, 20);
});

test("a centre with three feeds gets one vote on rain and direction", () => {
  const rows = points(
    [
      { rain: 2, windDeg: 0 },
      { rain: 3, windDeg: 10 },
      { rain: 0, windDeg: 180 },
      { rain: 0.1, windDeg: 190 },
    ],
    ["ecmwf-ifs", "ecmwf-aifs", "dwd-icon", "ukmo"],
  );
  const window = combineWindow(0, rows);
  assert.equal(window.rainVotes, 1);
  assert.equal(window.rainVoters, 3);
  assert.deepEqual(window.direction, { sector: "S", agreeing: 2, of: 3 });
});

test("directions inside a centre are averaged as arrows", () => {
  const [ecmwf] = byCentre(
    points([{ windDeg: 350 }, { windDeg: 10 }], ["ecmwf-ifs", "ecmwf-aifs"]),
  );
  near(ecmwf.windDeg! % 360, 0, 6);
  // Opposite directions cancel out; the first source's is kept.
  const [opposite] = byCentre(
    points([{ windDeg: 0 }, { windDeg: 180 }], ["ecmwf-ifs", "ecmwf-aifs"]),
  );
  assert.equal(opposite.windDeg, 0);
});

test("MET Norway counts with ECMWF, except in the Nordic area", () => {
  const monza = { latitude: 45.62, longitude: 9.28 };
  const oslo = { latitude: 59.91, longitude: 10.75 };
  assert.equal(inNordicArea(monza), false);
  assert.equal(inNordicArea(oslo), true);
  assert.equal(centreOf("met-norway", monza), "ECMWF");
  assert.equal(centreOf("met-norway", oslo), "MetCoOp");
  assert.equal(centreOf("met-norway"), "ECMWF");
  assert.equal(centreOf("smhi", oslo), "MetCoOp");
  // A source the app does not know is its own centre.
  assert.equal(centreOf("something-new"), "something-new");
  const rows = points(
    [{ temperature: 4 }, { temperature: 6 }, { temperature: 9 }],
    ["met-norway", "smhi", "ecmwf-ifs"],
  );
  assert.equal(
    combineWindow(0, rows, (source) => centreOf(source, oslo)).centres,
    2,
  );
  assert.equal(
    combineWindow(0, rows, (source) => centreOf(source, monza)).centres,
    2,
  );
});

test("every source has a label and a centre", () => {
  assert.equal(
    new Set(SOURCES.map((source) => source.id)).size,
    SOURCES.length,
  );
  for (const source of SOURCES) {
    assert.ok(source.label);
    assert.ok(source.centre);
  }
});
