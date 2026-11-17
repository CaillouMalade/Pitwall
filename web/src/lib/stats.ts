// Combines the providers' forecasts into one estimate per 3-hour window,
// with a 95% confidence interval.

import type { ForecastPoint } from "./types.ts";

export const MS_TO_KMH = 3.6;

/**
 * A provider "predicts rain" in a window from 0.1 mm: the smallest amount a rain
 * gauge records, so tiny rounding values like 0.01 mm don't count as rain.
 */
export const RAIN_THRESHOLD_MM = 0.1;

/**
 * Two-sided 95% t-values by number of providers (degrees of freedom = n - 1).
 * With only 2 or 3 values the normal 1.96 would look far more certain than it is.
 */
const T_VALUES_95: Record<number, number> = {
  2: 12.71,
  3: 4.3,
  4: 3.18,
  5: 2.78,
};

export function tValue(providers: number): number | null {
  if (providers < 2) return null;
  return T_VALUES_95[providers] ?? 1.96;
}

export interface Estimate {
  mean: number | null;
  /** Ends of the 95% interval; null with fewer than 2 values. */
  low: number | null;
  high: number | null;
  count: number;
}

export interface CombinedWindow {
  time: number;
  providers: number;
  temperature: Estimate;
  windKmh: Estimate;
  rain: Estimate;
  /** How many providers predict at least 0.1 mm. */
  rainProviders: number;
}

export function windKmh(
  point: Pick<ForecastPoint, "windSpeed">,
): number | null {
  return point.windSpeed === null ? null : point.windSpeed * MS_TO_KMH;
}

/** Mean ± t × standard deviation / √n over the values that are present. */
export function estimate(
  values: readonly (number | null)[],
  neverNegative = false,
): Estimate {
  const present = values.filter((value): value is number => value !== null);
  const count = present.length;
  if (count === 0) return { mean: null, low: null, high: null, count };
  const mean = present.reduce((sum, value) => sum + value, 0) / count;
  const t = tValue(count);
  if (t === null) return { mean, low: null, high: null, count };
  const variance =
    present.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  const margin = (t * Math.sqrt(variance)) / Math.sqrt(count);
  const low = mean - margin;
  return {
    mean,
    // Rain and wind can't go below zero, so the low end is cut at 0.
    low: neverNegative ? Math.max(0, low) : low,
    high: mean + margin,
    count,
  };
}

/**
 * One entry per 3-hour window, oldest first. Wind direction is not averaged
 * here (350° and 10° would give 180°); see directionVotes.
 */
export function combineForecasts(
  points: readonly ForecastPoint[],
): CombinedWindow[] {
  const byWindow = new Map<number, ForecastPoint[]>();
  for (const point of points) {
    const rows = byWindow.get(point.time) ?? [];
    rows.push(point);
    byWindow.set(point.time, rows);
  }
  return [...byWindow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, rows]) => ({
      time,
      providers: new Set(rows.map((row) => row.source)).size,
      temperature: estimate(rows.map((row) => row.temperature)),
      windKmh: estimate(rows.map(windKmh), true),
      rain: estimate(
        rows.map((row) => row.rain),
        true,
      ),
      rainProviders: rows.filter(
        (row) => row.rain !== null && row.rain >= RAIN_THRESHOLD_MM,
      ).length,
    }));
}
