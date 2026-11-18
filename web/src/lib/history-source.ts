// Past weather for any place, from Open-Meteo's Historical Weather API: the
// ERA5 and ECMWF IFS reanalysis, which is a model's reconstruction of the weather
// on a grid of a few kilometres, not a gauge at the track. It reaches back to 1940.

import { getJson, ServiceError, type FetchLike } from "./http.ts";
import type { DailyWeather, HourlyWeather } from "./history.ts";
import {
  fourDecimals,
  list,
  numberOrNull,
  readOrFail,
  record,
  time,
  validateLocation,
  type Location,
} from "./providers/read.ts";
import { addDays, localDay, zonedTime } from "./zone.ts";

export const HISTORY_PERIODS = [14, 30, 90] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

/** The archive's first day. */
export const FIRST_DAY = "1940-01-01";
/** The longest range of hourly values asked for in one go. */
export const MAX_RANGE_DAYS = 92;

const FORMAT = "The weather archive sent an answer in an unexpected format.";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

const place = (location: Location) => ({
  latitude: String(fourDecimals(location.latitude)),
  longitude: String(fourDecimals(location.longitude)),
});

/** Each day from `start` to `end` (both "2026-11-01", both included), on the zone's calendar. */
export async function fetchDays(
  location: Location,
  start: string,
  end: string,
  zone = "UTC",
  fetchImpl?: FetchLike,
): Promise<DailyWeather[]> {
  validateLocation(location);
  const params = new URLSearchParams({
    ...place(location),
    start_date: start,
    end_date: end,
    daily:
      "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    wind_speed_unit: "ms",
    timezone: zone,
  });
  const data = await getJson(`${ARCHIVE}?${params}`, { fetch: fetchImpl });
  const result = readOrFail(FORMAT, () => {
    const daily = record(record(data).daily);
    const series = (name: string) =>
      daily[name] === undefined ? [] : list(daily[name]).map(numberOrNull);
    const highs = series("temperature_2m_max");
    const lows = series("temperature_2m_min");
    const means = series("temperature_2m_mean");
    const rains = series("precipitation_sum");
    const winds = series("wind_speed_10m_max");
    const gusts = series("wind_gusts_10m_max");
    const directions = series("wind_direction_10m_dominant");
    return list(daily.time).map((day, i): DailyWeather => {
      if (typeof day !== "string" || !DAY_TEXT.test(day)) throw new TypeError();
      const min = lows[i] ?? null;
      const max = highs[i] ?? null;
      return {
        day,
        temperatureMin: min,
        temperatureMax: max,
        temperatureMean: means[i] ?? null,
        rain: rains[i] ?? null,
        temperatureRange: min === null || max === null ? null : max - min,
        windMax: winds[i] ?? null,
        gustMax: gusts[i] ?? null,
        windFrom: directions[i] ?? null,
      };
    });
  });
  // The newest days can still be empty; a day with nothing at all is left out.
  return result.filter(
    (day) =>
      day.temperatureMin !== null ||
      day.temperatureMax !== null ||
      day.rain !== null,
  );
}

/** The last `days` full days before today at the place, oldest first. */
export async function fetchHistory(
  location: Location,
  days: number,
  now: number = Date.now(),
  fetchImpl?: FetchLike,
  zone = "UTC",
): Promise<DailyWeather[]> {
  const today = localDay(now, zone);
  const known = await fetchDays(
    location,
    addDays(today, -days),
    addDays(today, -1),
    zone,
    fetchImpl,
  );
  if (known.length === 0) throw new ServiceError("format", FORMAT);
  return known;
}

/** Every hour of the days from `start` to `end` on the zone's calendar, oldest first. */
export async function fetchHours(
  location: Location,
  start: string,
  end: string,
  zone = "UTC",
  fetchImpl?: FetchLike,
): Promise<HourlyWeather[]> {
  validateLocation(location);
  const from = zonedTime(start, 0, zone);
  const to = zonedTime(addDays(end, 1), 0, zone);
  const params = new URLSearchParams({
    ...place(location),
    // Asked in UTC, a day wider on both sides, then cut to the local days.
    start_date: addDays(start, -1),
    end_date: addDays(end, 1),
    hourly:
      "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    wind_speed_unit: "ms",
    timezone: "UTC",
  });
  const data = await getJson(`${ARCHIVE}?${params}`, { fetch: fetchImpl });
  const rows = readOrFail(FORMAT, () => {
    const hourly = record(record(data).hourly);
    const series = (name: string) =>
      hourly[name] === undefined ? [] : list(hourly[name]).map(numberOrNull);
    const temperatures = series("temperature_2m");
    const rains = series("precipitation");
    const winds = series("wind_speed_10m");
    const directions = series("wind_direction_10m");
    const gusts = series("wind_gusts_10m");
    return list(hourly.time).map((value, i): HourlyWeather => ({
      // The archive's value at 03:00 covers the hour before it; an hour is
      // named here by its start, like the forecasts.
      time: time(value, true) - 3_600_000,
      temperature: temperatures[i] ?? null,
      rain: rains[i] ?? null,
      windSpeed: winds[i] ?? null,
      windDeg: directions[i] ?? null,
      gust: gusts[i] ?? null,
    }));
  });
  return rows.filter(
    (row) =>
      row.time >= from &&
      row.time < to &&
      (row.temperature !== null || row.rain !== null || row.windSpeed !== null),
  );
}

export interface YearDays {
  year: number;
  days: DailyWeather[];
}

/**
 * The same dates in earlier years: `length` days starting at `monthDay`
 * ("11-18") in each of `years`. One small request per year, a few at a time;
 * a year that fails is left out.
 */
export async function fetchSameDates(
  location: Location,
  monthDay: string,
  length: number,
  years: readonly number[],
  zone = "UTC",
  fetchImpl?: FetchLike,
): Promise<YearDays[]> {
  validateLocation(location);
  const results: (YearDays | null)[] = new Array(years.length).fill(null);
  let next = 0;
  let firstError: unknown = null;
  const worker = async () => {
    while (next < years.length) {
      const index = next++;
      const year = years[index];
      // 29 February in a year without one becomes 1 March.
      const start = new Date(Date.parse(`${year}-01-01T00:00:00Z`));
      const [month, day] = monthDay.split("-").map(Number);
      start.setUTCMonth(month - 1, day);
      const first = start.toISOString().slice(0, 10);
      try {
        const days = await fetchDays(
          location,
          first,
          addDays(first, length - 1),
          zone,
          fetchImpl,
        );
        if (days.length > 0) results[index] = { year, days };
      } catch (error) {
        firstError ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const found = results.filter((item): item is YearDays => item !== null);
  if (found.length === 0)
    throw firstError ?? new ServiceError("format", FORMAT);
  return found;
}
