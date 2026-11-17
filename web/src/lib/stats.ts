// Combines the sources' forecasts into one answer per 3-hour window: the middle
// value, how far the forecasting centres are apart, and how many expect rain.
// The reasoning behind each choice is in docs/METHOD.md.

import { centreOf } from "./sources.ts";
import type { ForecastPoint } from "./types.ts";
import { directionVote, meanDirection, type DirectionVote } from "./wind.ts";

/**
 * A centre "expects rain" in a window from 0.5 mm in the 3 hours: about what it
 * takes to wet a track. Traces like 0.1 or 0.2 mm, which most models produce
 * under any grey sky, do not count.
 */
export const RAIN_THRESHOLD_MM = 0.5;

/** A range needs at least this many centres; two values are just two values. */
export const MIN_FOR_RANGE = 3;

/** The range covers the middle 80% of the centres: 10th to 90th percentile. */
export const RANGE_LOW = 0.1;
export const RANGE_HIGH = 0.9;

export interface Estimate {
  /** The median of the centres; null when none has a value. */
  value: number | null;
  /** Ends of the 80% range; null with fewer than 3 centres. */
  low: number | null;
  high: number | null;
  /** One value per centre, lowest first. */
  values: number[];
}

export interface CombinedWindow {
  time: number;
  /** How many sources and how many centres have something for this window. */
  sources: number;
  centres: number;
  temperature: Estimate;
  /** In m/s. */
  wind: Estimate;
  rain: Estimate;
  /** How many centres expect at least RAIN_THRESHOLD_MM, of how many with a value. */
  rainVotes: number;
  rainVoters: number;
  direction: DirectionVote | null;
}

/** A value at a fraction of the way through sorted values, between neighbours. */
export function quantile(sorted: readonly number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

/** The median and 80% range of the values that are present. */
export function estimate(values: readonly (number | null)[]): Estimate {
  const sorted = values
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (sorted.length === 0)
    return { value: null, low: null, high: null, values: sorted };
  const ranged = sorted.length >= MIN_FOR_RANGE;
  return {
    value: quantile(sorted, 0.5),
    low: ranged ? quantile(sorted, RANGE_LOW) : null,
    high: ranged ? quantile(sorted, RANGE_HIGH) : null,
    values: sorted,
  };
}

/** What one centre says for one window: the middle of its sources. */
export interface CentreValue {
  centre: string;
  sources: string[];
  temperature: number | null;
  windSpeed: number | null;
  windDeg: number | null;
  rain: number | null;
}

const present = (values: (number | null)[]) =>
  values.filter((value): value is number => value !== null);

/** Merge the sources of each centre for one window, in order of first appearance. */
export function byCentre(
  rows: readonly ForecastPoint[],
  centre: (source: string) => string = centreOf,
): CentreValue[] {
  const groups = new Map<string, ForecastPoint[]>();
  for (const row of rows) {
    const name = centre(row.source);
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return [...groups.entries()].map(([name, group]) => {
    const directions = present(group.map((row) => row.windDeg));
    return {
      centre: name,
      sources: group.map((row) => row.source),
      temperature: median(present(group.map((row) => row.temperature))),
      windSpeed: median(present(group.map((row) => row.windSpeed))),
      // Opposite directions cancel out; then the first source's is kept.
      windDeg: meanDirection(directions) ?? directions[0] ?? null,
      rain: median(present(group.map((row) => row.rain))),
    };
  });
}

/** One window's sources as one combined answer. */
export function combineWindow(
  time: number,
  rows: readonly ForecastPoint[],
  centre: (source: string) => string = centreOf,
): CombinedWindow {
  const centres = byCentre(rows, centre);
  const rains = present(centres.map((item) => item.rain));
  return {
    time,
    sources: new Set(rows.map((row) => row.source)).size,
    centres: centres.length,
    temperature: estimate(centres.map((item) => item.temperature)),
    wind: estimate(centres.map((item) => item.windSpeed)),
    rain: estimate(centres.map((item) => item.rain)),
    rainVotes: rains.filter((rain) => rain >= RAIN_THRESHOLD_MM).length,
    rainVoters: rains.length,
    direction: directionVote(centres.map((item) => item.windDeg)),
  };
}

/** One entry per 3-hour window, oldest first. */
export function combineForecasts(
  points: readonly ForecastPoint[],
  centre: (source: string) => string = centreOf,
): CombinedWindow[] {
  const byWindow = new Map<number, ForecastPoint[]>();
  for (const point of points) {
    const rows = byWindow.get(point.time) ?? [];
    rows.push(point);
    byWindow.set(point.time, rows);
  }
  return [...byWindow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, rows]) => combineWindow(time, rows, centre));
}
