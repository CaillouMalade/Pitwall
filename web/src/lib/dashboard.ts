// Small helpers for the Weekend overview and Session dashboard pages.

import {
  centreOf,
  PROVIDER_LABELS,
  sourceLabel,
  sourceProvider,
} from "./sources.ts";
import {
  MIN_FOR_RANGE,
  RAIN_THRESHOLD_MM,
  type CombinedWindow,
  type Estimate,
} from "./stats.ts";
import type { ForecastPoint } from "./types.ts";
import { compassSector, type Sector } from "./wind.ts";
import { windowStart } from "./windows.ts";

/**
 * How far the centres are apart, as text: the 80% range from 3 centres, both
 * values with 2, and a plain statement with 1. `show` converts and rounds.
 */
export function rangeText(
  value: Estimate,
  unit: string,
  show: (value: number) => string,
): string {
  const { values } = value;
  if (values.length === 0) return "No value";
  if (values.length === 1) return "One source";
  if (
    values.length < MIN_FOR_RANGE ||
    value.low === null ||
    value.high === null
  )
    return `${show(values[0])} and ${show(values[1])} ${unit}`;
  return `80% range: ${show(value.low)} to ${show(value.high)} ${unit}`;
}

/** "3 of 9 expect ≥ 0.5 mm" */
export function rainText(window: CombinedWindow): string {
  if (window.rainVoters === 0) return "No value";
  return `${window.rainVotes} of ${window.rainVoters} expect ≥ ${RAIN_THRESHOLD_MM} mm`;
}

/** "14 sources from 9 centres" */
export function sourcesText(window: CombinedWindow): string {
  const sources = `${window.sources} source${window.sources === 1 ? "" : "s"}`;
  return window.centres === window.sources
    ? sources
    : `${sources} from ${window.centres} centre${window.centres === 1 ? "" : "s"}`;
}

/** The forecast rows (one per source) of the 3-hour window a session starts in. */
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
  if (rows.length === 0) return "No forecast reaches this session yet.";
  return null;
}

export interface SourceRow {
  source: string;
  label: string;
  /** The service the app asked, when its name says more than the label. */
  via: string | null;
  temperature: number | null;
  rain: number | null;
  /** In m/s. */
  windSpeed: number | null;
  windFrom: Sector | null;
}

function via(source: string): string | null {
  const provider = sourceProvider(source);
  const name = provider ? PROVIDER_LABELS[provider] : null;
  // "DMI Harmonie" already names DMI; "DWD MOSMIX" does not name Bright Sky.
  return name && !sourceLabel(source).includes(name) ? name : null;
}

export interface CentreRows {
  centre: string;
  rows: SourceRow[];
}

/** The sources of one window, grouped by centre in order of first appearance. */
export function sourceRows(
  rows: readonly ForecastPoint[],
  centre: (source: string) => string = centreOf,
): CentreRows[] {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const name = centre(row.source);
    const group = groups.get(name) ?? [];
    group.push({
      source: row.source,
      label: sourceLabel(row.source),
      via: via(row.source),
      temperature: row.temperature,
      rain: row.rain,
      windSpeed: row.windSpeed,
      windFrom: row.windDeg === null ? null : compassSector(row.windDeg),
    });
    groups.set(name, group);
  }
  return [...groups.entries()].map(([name, group]) => ({
    centre: name,
    rows: group,
  }));
}
