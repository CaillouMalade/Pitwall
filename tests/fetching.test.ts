// Fake providers stand in for the real ones, so these tests make no internet calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllForecasts } from "../web/src/lib/fetching.ts";
import { ServiceError } from "../web/src/lib/http.ts";
import {
  metNorway,
  openMeteo,
  type ForecastProvider,
} from "../web/src/lib/providers.ts";
import type { ForecastPoint, ProviderId } from "../web/src/lib/types.ts";
import { fakeFetch, fakeForecasts, fixture, json, utc } from "./helpers.ts";

const MONZA = { name: "Monza", latitude: 45.62, longitude: 9.28 };

function fake(
  source: string,
  result: ForecastPoint[] | Error,
): ForecastProvider {
  return {
    source: source as ProviderId,
    label: source === "met-norway" ? "MET Norway" : source,
    forecast: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("all providers end up in one list", async () => {
  const forecasts = fakeForecasts();
  const { points, failures } = await fetchAllForecasts(
    MONZA,
    Object.entries(forecasts).map(([source, list]) => fake(source, list)),
  );
  assert.deepEqual(failures, []);
  assert.equal(points.length, 3 * 8);
  assert.deepEqual([...new Set(points.map((point) => point.source))].sort(), [
    "met-norway",
    "open-meteo",
    "openweathermap",
  ]);
});

test("a failing provider is skipped and reported", async () => {
  const { points, failures } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", fakeForecasts()["open-meteo"]),
    fake(
      "met-norway",
      new ServiceError("offline", "Could not connect to the weather service."),
    ),
  ]);
  assert.deepEqual(failures, [
    "MET Norway: Could not connect to the weather service.",
  ]);
  assert.deepEqual(
    [...new Set(points.map((point) => point.source))],
    ["open-meteo"],
  );
});

test("no provider answers gives no points and two failures", async () => {
  const { points, failures } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", new Error("down")),
    fake("met-norway", new Error("down")),
  ]);
  assert.equal(points.length, 0);
  assert.equal(failures.length, 2);
  // An unexpected error's own text is never shown.
  assert.ok(failures.every((line) => !line.includes("down")));
});

test("the real providers: one answers, the other is rate limited", async () => {
  const now = utc(2026, 11, 15, 22, 10);
  const { points, failures } = await fetchAllForecasts(
    MONZA,
    [
      openMeteo(fakeFetch(json(fixture("open-meteo.json")))),
      metNorway(fakeFetch(new Response("", { status: 429 }))),
    ],
    now,
  );
  assert.equal(points.length, 4);
  assert.deepEqual(failures, [
    "MET Norway: Too many requests to the weather service. Wait a minute and try again.",
  ]);
});
