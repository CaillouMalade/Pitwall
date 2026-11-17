// Invented forecasts and fake HTTP answers, so no test touches the network.
// These numbers are made up: never use them in the app.

import { readFileSync } from "node:fs";
import type { FetchLike } from "../web/src/lib/http.ts";
import type { ForecastPoint, ProviderId } from "../web/src/lib/types.ts";

export const utc = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) => Date.UTC(year, month - 1, day, hour, minute);

export const FIRST_WINDOW = utc(2026, 11, 13);

// For each provider: temperature (°C), wind (m/s) and rain (mm) per window.
const FAKE_VALUES: Record<string, [number[], number[], number[]]> = {
  openweathermap: [
    [9, 8, 10, 14, 16, 13, 11, 10],
    [4, 4, 5, 6, 7, 6, 5, 4],
    [0, 0, 0, 0.4, 1.2, 0.8, 0, 0],
  ],
  "open-meteo": [
    [10, 9, 10, 13, 15, 14, 11, 9],
    [3, 4, 5, 5, 6, 6, 5, 4],
    [0, 0, 0.1, 0.6, 1.5, 0.5, 0, 0],
  ],
  "met-norway": [
    [9, 9, 11, 15, 17, 13, 12, 10],
    [4, 5, 5, 6, 8, 7, 5, 5],
    [0, 0, 0, 0.2, 0.9, 1.1, 0.2, 0],
  ],
};

/** The same 8 windows for three providers, all with wind from 225° (SW). */
export function fakeForecasts(): Record<string, ForecastPoint[]> {
  const forecasts: Record<string, ForecastPoint[]> = {};
  for (const [source, [temperatures, winds, rains]] of Object.entries(
    FAKE_VALUES,
  )) {
    forecasts[source] = temperatures.map((temperature, i) => ({
      source: source as ProviderId,
      time: FIRST_WINDOW + i * 3 * 3_600_000,
      temperature,
      windSpeed: winds[i],
      windDeg: 225,
      rain: rains[i],
    }));
  }
  return forecasts;
}

export function fakeTable(): ForecastPoint[] {
  return Object.values(fakeForecasts()).flat();
}

export interface FakeFetch extends FetchLike {
  calls: { url: string; init?: RequestInit }[];
}

/** Stands in for fetch: answers with a response, or rejects with an error. */
export function fakeFetch(
  answer: Response | Error | (() => Response),
): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    return typeof answer === "function" ? answer() : answer.clone();
  }) as FakeFetch;
  fn.calls = calls;
  return fn;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const status = (code: number) => new Response("", { status: code });

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  ) as T;
}

export function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}
