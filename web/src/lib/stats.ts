// Combines the sources' forecasts into one answer per hour, or per session: the
// middle value, how far the forecasting centres are apart, and how many expect rain.
// The reasoning behind each choice is in docs/METHOD.md.

import { centreOf } from "./sources.ts";
import type { ForecastPoint } from "./types.ts";
import { directionVote, meanDirection, type DirectionVote } from "./wind.ts";
import { HOUR, windowStart } from "./windows.ts";

/**
 * A centre "expects rain" in an hour from 0.2 mm: about what it takes to wet a
 * track. A trace of 0.1 mm, which most models produce under any grey sky, does
 * not count. (With 3-hour windows the threshold was 0.5 mm.)
 */
export const RAIN_THRESHOLD_MM = 0.2;

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

/** One entry per hour, oldest first. */
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

const mean = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/** The full hours a period touches: 13:30 to 15:00 gives 13:00 and 14:00. */
export function hoursOf(start: number, end: number): number[] {
  const hours: number[] = [];
  for (
    let time = windowStart(start);
    time < Math.max(end, start + 1);
    time += HOUR
  )
    hours.push(time);
  return hours;
}

/** What one source says for a whole period. */
export interface PeriodPoint extends ForecastPoint {
  /** The wettest hour of the period, in mm; null when no hour has a value. */
  peakRain: number | null;
}

/**
 * Each source's hours of a period as one row: mean temperature and wind, the
 * direction as the mean arrow, and the rain total. A source that misses the
 * rain of one of the hours has no total, as a partial sum would look too dry.
 */
export function periodPoints(
  points: readonly ForecastPoint[],
  start: number,
  end: number,
): PeriodPoint[] {
  const hours = hoursOf(start, end);
  const wanted = new Set(hours);
  const bySource = new Map<string, ForecastPoint[]>();
  for (const point of points) {
    if (!wanted.has(point.time)) continue;
    const rows = bySource.get(point.source) ?? [];
    rows.push(point);
    bySource.set(point.source, rows);
  }
  return [...bySource.entries()].map(([source, rows]) => {
    const rains = present(rows.map((row) => row.rain));
    const directions = present(rows.map((row) => row.windDeg));
    return {
      source,
      time: hours[0],
      temperature: mean(present(rows.map((row) => row.temperature))),
      windSpeed: mean(present(rows.map((row) => row.windSpeed))),
      windDeg: meanDirection(directions) ?? directions[0] ?? null,
      rain:
        rains.length === hours.length
          ? rains.reduce((sum, rain) => sum + rain, 0)
          : null,
      peakRain: rains.length ? Math.max(...rains) : null,
    };
  });
}

export interface CombinedPeriod extends CombinedWindow {
  /** The hours of the period. */
  hours: number;
  /** One row per source, for the table. */
  rows: PeriodPoint[];
}

/**
 * A whole session as one answer. Rain is the total over its hours; a centre
 * "expects rain" when its wettest hour reaches RAIN_THRESHOLD_MM.
 */
export function combinePeriod(
  points: readonly ForecastPoint[],
  start: number,
  end: number,
  centre: (source: string) => string = centreOf,
): CombinedPeriod {
  const rows = periodPoints(points, start, end);
  const combined = combineWindow(windowStart(start), rows, centre);
  const peaks = new Map<string, number[]>();
  for (const row of rows) {
    if (row.peakRain === null) continue;
    const name = centre(row.source);
    peaks.set(name, [...(peaks.get(name) ?? []), row.peakRain]);
  }
  const centrePeaks = [...peaks.values()].map((values) => median(values)!);
  return {
    ...combined,
    rainVotes: centrePeaks.filter((peak) => peak >= RAIN_THRESHOLD_MM).length,
    rainVoters: centrePeaks.length,
    hours: hoursOf(start, end).length,
    rows,
  };
}

export type Confidence = "high" | "medium" | "low" | "unknown";

/**
 * How much to trust the combined answer, from how far the centres are apart.
 * These are rules of thumb, not probabilities; docs/METHOD.md lists them.
 */
export function confidence(window: CombinedWindow): {
  temperature: Confidence;
  rain: Confidence;
  wind: Confidence;
  overall: Confidence;
} {
  const width = (value: Estimate) =>
    value.values.length < 2
      ? null
      : (value.high ?? value.values.at(-1)!) - (value.low ?? value.values[0]);
  const grade = (spread: number | null, tight: number, loose: number) =>
    spread === null
      ? ("unknown" as const)
      : spread <= tight
        ? ("high" as const)
        : spread <= loose
          ? ("medium" as const)
          : ("low" as const);
  const temperature = grade(width(window.temperature), 2, 4);
  // In m/s: 2 m/s is about 7 km/h.
  const wind = grade(width(window.wind), 2, 4);
  let rain: Confidence = "unknown";
  if (window.rainVoters >= 2) {
    const share = window.rainVotes / window.rainVoters;
    const split = Math.min(share, 1 - share);
    rain = split <= 0.15 ? "high" : split <= 0.34 ? "medium" : "low";
  }
  const order: Confidence[] = ["high", "medium", "low"];
  const known = [temperature, rain, wind].filter((item) => item !== "unknown");
  const overall = known.length
    ? order[Math.max(...known.map((item) => order.indexOf(item)))]
    : "unknown";
  return { temperature, rain, wind, overall };
}
