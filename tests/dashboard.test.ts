// The page helpers on the invented forecast. Its 8 windows are Friday 13 November
// 2026, 00:00 to 21:00 UTC, and every provider says 225° (SW).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chanceOfRain,
  compassSector,
  directionVotes,
  intervalText,
  providerRows,
  sessionMessage,
  sessionWindowRows,
  voteText,
} from "../web/src/lib/dashboard.ts";
import { combineForecasts } from "../web/src/lib/stats.ts";
import { fakeTable, utc } from "./helpers.ts";

const FP1 = utc(2026, 11, 13, 8); // in the 06:00 window

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

test("direction votes on the fake forecast", () => {
  const vote = directionVotes(sessionWindowRows(fakeTable(), FP1));
  assert.deepEqual(vote, { sector: "SW", agreeing: 3, providers: 3 });
  assert.equal(voteText(vote!), "3 of 3 agree");
});

test("direction votes with a disagreement and a missing value", () => {
  const rows = [350, 10, 90, null].map((windDeg) => ({ windDeg }));
  // Two providers say N, one says E, one sent no direction.
  assert.deepEqual(directionVotes(rows), {
    sector: "N",
    agreeing: 2,
    providers: 3,
  });
});

test("direction votes with no direction", () => {
  assert.equal(directionVotes([{ windDeg: null }, { windDeg: null }]), null);
});

test("chance of rain from the combined windows", () => {
  const combined = combineForecasts(fakeTable());
  assert.equal(chanceOfRain(combined[0]), 0);
  assert.ok(Math.abs(chanceOfRain(combined[2]) - 33.33) < 0.01);
  assert.equal(chanceOfRain(combined[3]), 100);
});

test("session window rows pick the window of the session", () => {
  const rows = sessionWindowRows(fakeTable(), FP1);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.temperature),
    [10, 10, 11],
  );
});

test("session message", () => {
  const rows = sessionWindowRows(fakeTable(), FP1);
  const thursday = utc(2026, 11, 12, 10);
  const saturday = utc(2026, 11, 14, 10);
  assert.equal(sessionMessage(FP1, thursday, rows), null);
  assert.equal(sessionMessage(FP1, saturday, rows), "This session is over.");
  assert.equal(sessionMessage(FP1, thursday, []), "No forecast yet.");
  // A session that started earlier in the current window is not over yet.
  assert.equal(sessionMessage(FP1, utc(2026, 11, 13, 8, 30), rows), null);
});

test("provider rows for FP1", () => {
  const rows = providerRows(sessionWindowRows(fakeTable(), FP1));
  assert.deepEqual(
    rows.map((row) => row.provider),
    ["openweathermap", "Open-Meteo", "MET Norway"],
  );
  // The 06:00 window: wind 5 m/s for every provider, which is 18 km/h, from 225° (SW).
  assert.deepEqual(
    rows.map((row) => row.windKmh),
    [18, 18, 18],
  );
  assert.deepEqual(
    rows.map((row) => row.windFrom),
    ["SW", "SW", "SW"],
  );
});

test("provider rows with a missing direction", () => {
  const [row] = providerRows([
    {
      source: "met-norway",
      time: 0,
      temperature: 10,
      rain: null,
      windSpeed: 2,
      windDeg: null,
    },
  ]);
  assert.equal(row.windFrom, "Unknown");
  assert.equal(row.rain, null);
});

test("interval text", () => {
  const [first] = combineForecasts(fakeTable());
  assert.equal(intervalText(first.temperature, "°C"), "95%: 7.9 to 10.8 °C");
});

test("interval text with one provider", () => {
  const [one] = combineForecasts(fakeTable().slice(0, 1));
  assert.equal(
    intervalText(one.temperature, "°C"),
    "One provider only: no interval",
  );
});
