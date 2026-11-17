// The statistics on the invented forecast, never on real API calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllForecasts } from "../web/src/lib/fetching.ts";
import type { ForecastProvider } from "../web/src/lib/providers.ts";
import { combineForecasts, tValue } from "../web/src/lib/stats.ts";
import type { ForecastPoint, ProviderId } from "../web/src/lib/types.ts";
import { fakeForecasts, fakeTable } from "./helpers.ts";

const near = (actual: number | null, expected: number, digits = 3) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 10 ** -digits,
    `${actual} ≈ ${expected}`,
  );

test("one entry per window", () => {
  const combined = combineForecasts(fakeTable());
  assert.equal(combined.length, 8);
  assert.deepEqual(
    combined.map((window) => window.providers),
    Array(8).fill(3),
  );
  assert.deepEqual(
    combined.map((window) => window.time),
    [...combined.map((window) => window.time)].sort((a, b) => a - b),
  );
});

test("first window mean and interval, by hand", () => {
  // 9, 10 and 9 °C: mean 9.33, standard deviation 0.577,
  // margin 4.30 × 0.577 / √3 = 1.43, so the interval is 7.90 to 10.77.
  const [first] = combineForecasts(fakeTable());
  near(first.temperature.mean, 9.333);
  near(first.temperature.low, 7.9);
  near(first.temperature.high, 10.766);
});

test("wind is averaged in km/h", () => {
  // 4, 3 and 4 m/s average 3.67 m/s, which is 13.2 km/h.
  near(combineForecasts(fakeTable())[0].windKmh.mean, 13.2, 9);
});

test("rain providers count from 0.1 mm", () => {
  const combined = combineForecasts(fakeTable());
  assert.equal(combined[0].rainProviders, 0);
  assert.equal(combined[2].rainProviders, 1);
  assert.equal(combined[3].rainProviders, 3);
  assert.equal(combined[6].rainProviders, 1);
});

test("rain and wind intervals never go below zero", () => {
  for (const window of combineForecasts(fakeTable())) {
    assert.ok(window.rain.low! >= 0);
    assert.ok(window.windKmh.low! >= 0);
  }
});

test("providers that agree give a zero-width interval", () => {
  const points = fakeForecasts()["open-meteo"];
  const table = ["a", "b", "c"].flatMap((source) =>
    points.map((point) => ({ ...point, source: source as ProviderId })),
  );
  const [first] = combineForecasts(table);
  assert.equal(first.temperature.low, first.temperature.mean);
  assert.equal(first.temperature.high, first.temperature.mean);
});

test("one provider gives the value without an interval", () => {
  const combined = combineForecasts(fakeForecasts()["met-norway"]);
  assert.deepEqual(
    combined.map((window) => window.providers),
    Array(8).fill(1),
  );
  assert.equal(combined[0].temperature.mean, 9);
  assert.equal(combined[0].temperature.low, null);
});

test("two providers use the wider t-value", () => {
  const table = fakeTable().filter(
    (point) => (point.source as string) !== "openweathermap",
  );
  const [first] = combineForecasts(table);
  // 10 and 9 °C: mean 9.5, standard deviation 0.707, margin 12.71 × 0.707 / √2 = 6.355.
  assert.equal(first.providers, 2);
  near(first.temperature.high, 9.5 + 6.355);
});

test("missing values are left out of the mean and the count", () => {
  const table: ForecastPoint[] = [
    {
      source: "open-meteo",
      time: 0,
      temperature: 10,
      windSpeed: 1,
      windDeg: 0,
      rain: null,
    },
    {
      source: "met-norway",
      time: 0,
      temperature: 12,
      windSpeed: 1,
      windDeg: 0,
      rain: 0.4,
    },
  ];
  const [window] = combineForecasts(table);
  assert.equal(window.providers, 2);
  assert.equal(window.rain.mean, 0.4);
  assert.equal(window.rain.count, 1);
  assert.equal(window.rain.low, null);
  assert.equal(window.rainProviders, 1);
});

test("t-value for each number of providers", () => {
  assert.equal(tValue(1), null);
  assert.equal(tValue(2), 12.71);
  assert.equal(tValue(3), 4.3);
  assert.equal(tValue(30), 1.96);
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

test("works on the fetchAllForecasts output", async () => {
  const forecasts = fakeForecasts();
  const providers: ForecastProvider[] = Object.entries(forecasts).map(
    ([source, points]) => ({
      source: source as ProviderId,
      label: source,
      forecast: async () => points,
    }),
  );
  const { points, failures } = await fetchAllForecasts(
    { name: "Monza", latitude: 45.62, longitude: 9.28 },
    providers,
  );
  const combined = combineForecasts(points);
  assert.deepEqual(failures, []);
  assert.equal(combined.length, 8);
  assert.equal(combined[4].rainProviders, 3);
});
