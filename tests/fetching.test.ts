// Fake adapters stand in for the real ones, so these tests make no internet calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllForecasts } from "../web/src/lib/fetching.ts";
import { ServiceError } from "../web/src/lib/http.ts";
import {
  metNorway,
  openMeteo,
  type ForecastProvider,
} from "../web/src/lib/providers/index.ts";
import type { ProviderId } from "../web/src/lib/sources.ts";
import type { ForecastPoint } from "../web/src/lib/types.ts";
import { fakeFetch, fakeForecasts, fixture, json, utc } from "./helpers.ts";

const MONZA = { name: "Monza", latitude: 45.62, longitude: 9.28 };

function fake(
  id: ProviderId,
  result: ForecastPoint[] | Error,
  extra: Partial<ForecastProvider> = {},
): ForecastProvider {
  return {
    id,
    sources: result instanceof Error ? [id] : [result[0]?.source ?? id],
    forecast: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    ...extra,
  };
}

const forecasts = fakeForecasts();

test("all adapters end up in one list", async () => {
  const { points, failures, statuses } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", forecasts["noaa-gfs"]),
    fake("bright-sky", forecasts["dwd-icon"]),
    fake("met-norway", forecasts["met-norway"]),
  ]);
  assert.deepEqual(failures, []);
  assert.equal(points.length, 3 * 8);
  assert.deepEqual([...new Set(points.map((point) => point.source))].sort(), [
    "dwd-icon",
    "met-norway",
    "noaa-gfs",
  ]);
  assert.deepEqual(
    statuses.map((status) => [status.id, status.state, status.answered]),
    [
      ["open-meteo", "answered", ["noaa-gfs"]],
      ["bright-sky", "answered", ["dwd-icon"]],
      ["met-norway", "answered", ["met-norway"]],
    ],
  );
});

test("a failing adapter is skipped and reported", async () => {
  const { points, failures, statuses } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", forecasts["dwd-icon"]),
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
    ["dwd-icon"],
  );
  assert.equal(statuses[1].state, "failed");
  assert.equal(
    statuses[1].message,
    "Could not connect to the weather service.",
  );
  assert.deepEqual(statuses[1].answered, []);
});

test("no adapter answers gives no points and two failures", async () => {
  const { points, failures } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", new Error("down")),
    fake("met-norway", new Error("down")),
  ]);
  assert.equal(points.length, 0);
  assert.equal(failures.length, 2);
  // An unexpected error's own text is never shown.
  assert.ok(failures.every((line) => !line.includes("down")));
});

test("a service that does not cover the place is not called and is no failure", async () => {
  let called = false;
  const { failures, statuses } = await fetchAllForecasts(MONZA, [
    fake("open-meteo", forecasts["dwd-icon"]),
    fake("nws", [], {
      covers: () => false,
      forecast: async () => {
        called = true;
        return [];
      },
    }),
    // Covered on paper, but the service itself says it has nothing here.
    fake("smhi", new ServiceError("no-coverage", "")),
  ]);
  assert.equal(called, false);
  assert.deepEqual(failures, []);
  assert.deepEqual(
    statuses.map((status) => status.state),
    ["answered", "outside", "outside"],
  );
});

test("an answer with nothing for the coming days is empty, not failed", async () => {
  const { failures, statuses } = await fetchAllForecasts(MONZA, [
    fake("fmi", []),
  ]);
  assert.deepEqual(failures, []);
  assert.equal(statuses[0].state, "empty");
});

test("the status says which of a service's sources answered", async () => {
  const { statuses } = await fetchAllForecasts(MONZA, [
    {
      id: "open-meteo",
      sources: ["noaa-gfs", "dwd-icon", "meteoswiss-icon"],
      forecast: async () => [
        ...forecasts["noaa-gfs"],
        ...forecasts["dwd-icon"],
      ],
    },
  ]);
  assert.deepEqual(statuses[0].answered, ["noaa-gfs", "dwd-icon"]);
  assert.deepEqual(statuses[0].sources, [
    "noaa-gfs",
    "dwd-icon",
    "meteoswiss-icon",
  ]);
  assert.equal(statuses[0].label, "Open-Meteo");
});

test("the real adapters: one answers, the other is rate limited", async () => {
  const now = utc(2026, 11, 15, 22, 10);
  const { points, failures } = await fetchAllForecasts(
    MONZA,
    [
      openMeteo(fakeFetch(json(fixture("open-meteo.json"))), [
        ["icon_seamless", "dwd-icon"],
      ]),
      metNorway(fakeFetch(new Response("", { status: 429 }))),
    ],
    now,
  );
  assert.equal(points.length, 12);
  assert.deepEqual(failures, [
    "MET Norway: Too many requests to the weather service. Wait a minute and try again.",
  ]);
});
