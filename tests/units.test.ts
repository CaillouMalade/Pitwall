// Display units: conversions, and the defaults by region.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatNumber,
  formatValue,
  unitFormat,
} from "../web/src/lib/format.ts";
import {
  defaultUnits,
  isUnits,
  toTemperature,
  toTemperatureDifference,
  toWind,
} from "../web/src/lib/units.ts";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

test("temperature", () => {
  assert.equal(toTemperature(20, "c"), 20);
  assert.equal(toTemperature(20, "f"), 68);
  assert.equal(toTemperature(0, "f"), 32);
  assert.equal(toTemperature(-40, "f"), -40);
});

test("a temperature difference is scaled, not shifted", () => {
  // A day that swings 10 °C swings 18 °F, not 50.
  assert.equal(toTemperatureDifference(10, "f"), 18);
  assert.equal(toTemperatureDifference(10, "c"), 10);
  assert.equal(toTemperatureDifference(0, "f"), 0);
});

test("wind", () => {
  assert.equal(toWind(10, "ms"), 10);
  near(toWind(10, "kmh"), 36);
  near(toWind(10, "mph"), 22.369362921);
});

test("formatting in the chosen units", () => {
  const metric = unitFormat({ temperature: "c", wind: "kmh" });
  assert.equal(metric.temperature(7.46), "7.5 °C");
  assert.equal(metric.wind(7.2), "26 km/h");
  assert.equal(metric.temperatureDifference(4.2), "4.2 °C");
  assert.equal(metric.temperature(null), "–");
  assert.equal(metric.wind(null), "–");

  const imperial = unitFormat({ temperature: "f", wind: "mph" });
  assert.equal(imperial.temperature(20), "68.0 °F");
  assert.equal(imperial.wind(10), "22 mph");
  assert.equal(imperial.temperatureDifference(10), "18.0 °F");
  assert.equal(imperial.temperatureUnit, "°F");
  assert.equal(imperial.windUnit, "mph");

  // m/s numbers are small, so they keep a decimal.
  const si = unitFormat({ temperature: "c", wind: "ms" });
  assert.equal(si.wind(7.25), "7.3 m/s");
  assert.equal(si.windNumber(7.25), "7.3");
});

test("numbers never show a negative zero", () => {
  assert.equal(formatNumber(-0.04), "0.0");
  assert.equal(formatValue(-0.04, "°C"), "0.0 °C");
  assert.equal(formatValue(Number.NaN, "mm"), "–");
});

test("default units follow the region", () => {
  assert.deepEqual(defaultUnits("en-US"), { temperature: "f", wind: "mph" });
  assert.deepEqual(defaultUnits("en-GB"), { temperature: "c", wind: "mph" });
  assert.deepEqual(defaultUnits("fr-FR"), { temperature: "c", wind: "kmh" });
  assert.deepEqual(defaultUnits("es"), { temperature: "c", wind: "kmh" });
  assert.deepEqual(defaultUnits(undefined), { temperature: "c", wind: "kmh" });
});

test("only known units are accepted", () => {
  assert.equal(isUnits({ temperature: "c", wind: "ms" }), true);
  assert.equal(isUnits({ temperature: "k", wind: "ms" }), false);
  assert.equal(isUnits({ temperature: "c" }), false);
  assert.equal(isUnits(null), false);
});
