// Small helpers for the Weekend overview and Session dashboard pages.

import { PROVIDER_LABELS } from "./labels.ts";
import { windKmh, type CombinedWindow, type Estimate } from "./stats.ts";
import type { ForecastPoint, ProviderId } from "./types.ts";
import { windowStart } from "./windows.ts";

export const COMPASS_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;
export type Sector = (typeof COMPASS_SECTORS)[number];

/** A wind direction in degrees as N, NE, E, SE, S, SW, W or NW. */
export function compassSector(degrees: number): Sector {
  // Round to the closest of the 8 sectors; 360° goes back to N.
  const index = (((Math.round(degrees / 45) % 8) + 8) % 8) as number;
  return COMPASS_SECTORS[index];
}

export interface DirectionVote {
  sector: Sector;
  agreeing: number;
  providers: number;
}

/**
 * The most common direction among the providers of one window. Votes are counted
 * instead of averaging the degrees: the average of 350° and 10° would be 180°.
 */
export function directionVotes(
  rows: readonly Pick<ForecastPoint, "windDeg">[],
): DirectionVote | null {
  const votes = new Map<Sector, number>();
  for (const row of rows) {
    if (row.windDeg === null) continue;
    const sector = compassSector(row.windDeg);
    votes.set(sector, (votes.get(sector) ?? 0) + 1);
  }
  let best: Sector | null = null;
  let total = 0;
  for (const [sector, count] of votes) {
    total += count;
    if (best === null || count > votes.get(best)!) best = sector;
  }
  return best === null
    ? null
    : { sector: best, agreeing: votes.get(best)!, providers: total };
}

export function voteText(vote: DirectionVote): string {
  return `${vote.agreeing} of ${vote.providers} agree`;
}

export function formatNumber(value: number, digits = 1): string {
  // Avoid "-0.0" for values that round to zero.
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

/** The 95% interval as text, e.g. "95%: 10.1 to 14.7 °C". */
export function intervalText(
  value: Estimate,
  unit: string,
  digits = 1,
): string {
  if (value.low === null || value.high === null)
    return "One provider only: no interval";
  return `95%: ${formatNumber(value.low, digits)} to ${formatNumber(value.high, digits)} ${unit}`;
}

/** Percentage of providers that predict rain. */
export function chanceOfRain(window: CombinedWindow): number {
  return window.providers === 0
    ? 0
    : (window.rainProviders / window.providers) * 100;
}

/** The forecast rows (one per provider) of the 3-hour window a session starts in. */
export function sessionWindowRows<T extends { time: number }>(
  points: readonly T[],
  sessionStart: number,
): T[] {
  const start = windowStart(sessionStart);
  return points.filter((point) => point.time === start);
}

/** The message to show instead of a forecast, or null when there is one to show. */
export function sessionMessage(
  sessionStart: number,
  now: number,
  rows: readonly unknown[],
): string | null {
  if (windowStart(sessionStart) < windowStart(now))
    return "This session is over.";
  if (rows.length === 0) return "No forecast yet.";
  return null;
}

export interface ProviderRow {
  provider: string;
  source: ProviderId;
  temperature: number | null;
  rain: number | null;
  windKmh: number | null;
  windFrom: Sector | "Unknown";
}

/** One row per provider for one window, in km/h and compass sectors. */
export function providerRows(rows: readonly ForecastPoint[]): ProviderRow[] {
  return rows.map((row) => ({
    provider: PROVIDER_LABELS[row.source] ?? row.source,
    source: row.source,
    temperature: row.temperature,
    rain: row.rain,
    windKmh: windKmh(row),
    windFrom: row.windDeg === null ? "Unknown" : compassSector(row.windDeg),
  }));
}
