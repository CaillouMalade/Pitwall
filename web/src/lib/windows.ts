// The 3-hour UTC windows (00, 03, ... 21) every forecast source is cut into.

import type { ForecastPoint } from "./types.ts";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WINDOW_HOURS = 3;
export const WINDOW = WINDOW_HOURS * HOUR;
/** How far ahead forecasts are kept. Most sources thin out well before this. */
export const FORECAST_DAYS = 7;

/** True for 00:00, 03:00, ... 21:00 UTC. */
export function isWindowStart(time: number): boolean {
  return time % WINDOW === 0;
}

/** The start of the 3-hour window a time falls in (14:20 gives 12:00). */
export function windowStart(time: number): number {
  return Math.floor(time / WINDOW) * WINDOW;
}

/** The rain of the hours in one window, or null if any hour is missing. */
export function sumRain(
  amounts: readonly (number | null | undefined)[],
): number | null {
  // A partial sum would look like a real (too low) value, so we don't make one.
  let total = 0;
  for (const amount of amounts) {
    if (amount === null || amount === undefined) return null;
    total += amount;
  }
  return total;
}

/** Keep the points from the current window up to the forecast range. */
export function keepForecastRange<T extends { time: number }>(
  points: T[],
  now: number,
): T[] {
  const first = windowStart(now);
  const last = first + FORECAST_DAYS * DAY;
  return points.filter((point) => point.time >= first && point.time < last);
}

/** What a source says for one moment. */
export interface Instant {
  temperature: number | null;
  windSpeed: number | null;
  windDeg: number | null;
}

/**
 * Hourly values as 3-hour windows. `instants` holds the values at a moment,
 * `rainByHour` the rain that falls in the hour starting at its key. A window
 * takes the values at its start and the rain of its 3 hours; when one of those
 * hours is missing the rain stays null. Windows where the source says nothing
 * at all are left out.
 */
export function hourlyToWindows(
  source: string,
  instants: ReadonlyMap<number, Instant>,
  rainByHour: ReadonlyMap<number, number | null>,
): ForecastPoint[] {
  const starts = new Set<number>();
  for (const time of instants.keys()) if (isWindowStart(time)) starts.add(time);
  for (const time of rainByHour.keys()) starts.add(windowStart(time));
  const points: ForecastPoint[] = [];
  for (const time of [...starts].sort((a, b) => a - b)) {
    const instant = instants.get(time);
    const rain = sumRain([
      rainByHour.get(time),
      rainByHour.get(time + HOUR),
      rainByHour.get(time + 2 * HOUR),
    ]);
    const point: ForecastPoint = {
      source,
      time,
      temperature: instant?.temperature ?? null,
      windSpeed: instant?.windSpeed ?? null,
      windDeg: instant?.windDeg ?? null,
      rain,
    };
    if (
      point.temperature === null &&
      point.windSpeed === null &&
      point.windDeg === null &&
      point.rain === null
    )
      continue;
    points.push(point);
  }
  return points;
}
