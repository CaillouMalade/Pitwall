// Analyses of logged observations, used by the History and Track comparison pages.

import { RAIN_THRESHOLD_MM } from "./stats.ts";

export interface Observation {
  time: number;
  trackId: string;
  track: string;
  temperature: number | null;
  /** Rolling one-hour total in mm; null when the logger had none. */
  rain: number | null;
}

/** A track needs readings on at least this many days before its history is drawn. */
export const MIN_DAYS_LOGGED = 2;

// The collector's column names, with the shorter names also accepted.
const COLUMNS = {
  time: ["fetched_at_utc", "timestamp_utc"],
  trackId: ["location_id"],
  track: ["location_name", "location"],
  temperature: ["temperature_c", "temperature"],
  rain: ["rain_1h_mm", "rain"],
} as const;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function optionalNumber(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Read observations from CSV text; rows without a time or track are skipped. */
export function parseObservations(text: string): Observation[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "");
  const index = (names: readonly string[]) =>
    names
      .map((name) => header.indexOf(name))
      .find((position) => position >= 0) ?? -1;
  const at = {
    time: index(COLUMNS.time),
    trackId: index(COLUMNS.trackId),
    track: index(COLUMNS.track),
    temperature: index(COLUMNS.temperature),
    rain: index(COLUMNS.rain),
  };
  if (at.time < 0 || at.trackId < 0) return [];
  const observations: Observation[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const cells = splitCsvLine(line);
    const time = Date.parse(cells[at.time] ?? "");
    const trackId = cells[at.trackId]?.trim();
    if (Number.isNaN(time) || !trackId) continue;
    observations.push({
      time,
      trackId,
      track: (at.track >= 0 ? cells[at.track] : undefined) || trackId,
      temperature:
        at.temperature >= 0 ? optionalNumber(cells[at.temperature]) : null,
      rain: at.rain >= 0 ? optionalNumber(cells[at.rain]) : null,
    });
  }
  return observations;
}

/** The UTC calendar day, as "2026-11-01". */
export function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function daysLogged(
  history: readonly Observation[],
  trackId: string,
): number {
  return new Set(
    history
      .filter((row) => row.trackId === trackId)
      .map((row) => utcDay(row.time)),
  ).size;
}

export interface DailyWeather {
  day: string;
  temperatureMin: number | null;
  temperatureMax: number | null;
  temperatureMean: number | null;
  /** Estimated daily rain in mm. */
  rain: number;
  /** Highest minus lowest temperature of the day. */
  temperatureRange: number | null;
}

const mean = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/** Daily rain estimate and temperature range for one track, oldest day first. */
export function trackRainHistory(
  history: readonly Observation[],
  trackId: string,
): DailyWeather[] {
  const days = new Map<string, Observation[]>();
  for (const row of history) {
    if (row.trackId !== trackId) continue;
    const day = utcDay(row.time);
    const rows = days.get(day) ?? [];
    rows.push(row);
    days.set(day, rows);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, rows]) => {
      const temperatures = rows
        .map((row) => row.temperature)
        .filter((value): value is number => value !== null);
      const min = temperatures.length ? Math.min(...temperatures) : null;
      const max = temperatures.length ? Math.max(...temperatures) : null;
      // The logger records a rolling one-hour total every 30 minutes, so the
      // daily rain is the day's mean × 24. A missing value counts as 0 mm.
      const rain = mean(rows.map((row) => row.rain ?? 0))! * 24;
      return {
        day,
        temperatureMin: min,
        temperatureMax: max,
        temperatureMean: mean(temperatures),
        rain,
        temperatureRange: min === null || max === null ? null : max - min,
      };
    });
}

export class TrackSummary {
  constructor(
    readonly trackId: string,
    readonly track: string,
    readonly averageTemperature: number | null,
    readonly rainDays: number,
    readonly totalRain: number,
    readonly daysLogged: number,
  ) {}

  toString(): string {
    const average =
      this.averageTemperature === null
        ? "no temperature"
        : `average ${this.averageTemperature.toFixed(1)} °C`;
    return `${this.track}: ${average}, ${this.rainDays} rain days, ${this.totalRain.toFixed(1)} mm total rain over ${this.daysLogged} logged days.`;
  }
}

/** Summaries of the given tracks, ranked from wettest to driest. */
export function compareTrackHistory(
  history: readonly Observation[],
  trackIds: readonly string[],
): TrackSummary[] {
  const summaries: TrackSummary[] = [];
  for (const trackId of trackIds) {
    const rows = history.filter((row) => row.trackId === trackId);
    if (rows.length === 0) continue;
    const daily = trackRainHistory(history, trackId);
    summaries.push(
      new TrackSummary(
        trackId,
        rows[0].track,
        mean(
          rows
            .map((row) => row.temperature)
            .filter((value): value is number => value !== null),
        ),
        // Same threshold as the forecasts: below 0.1 mm a day is not rainy.
        daily.filter((day) => day.rain >= RAIN_THRESHOLD_MM).length,
        daily.reduce((sum, day) => sum + day.rain, 0),
        daily.length,
      ),
    );
  }
  // A stable sort keeps the chosen order for tracks with the same rain.
  return summaries.sort((a, b) => b.totalRain - a.totalRain);
}

export interface HistoryTrack {
  id: string;
  name: string;
}

/** Tracks with enough logged history, in the order they first appear. */
export function historyTracks(history: readonly Observation[]): HistoryTrack[] {
  const names = new Map<string, string>();
  const days = new Map<string, Set<string>>();
  for (const row of history) {
    if (!names.has(row.trackId)) names.set(row.trackId, row.track);
    const set = days.get(row.trackId) ?? new Set<string>();
    set.add(utcDay(row.time));
    days.set(row.trackId, set);
  }
  return [...names.entries()]
    .filter(([id]) => days.get(id)!.size >= MIN_DAYS_LOGGED)
    .map(([id, name]) => ({ id, name }));
}

/** The rows of the period every chosen track was logged, or null when they never overlap. */
export function sharedPeriod(
  history: readonly Observation[],
  trackIds: readonly string[],
): Observation[] | null {
  let start = -Infinity;
  let end = Infinity;
  for (const trackId of trackIds) {
    const times = history
      .filter((row) => row.trackId === trackId)
      .map((row) => row.time);
    if (times.length === 0) return null;
    start = Math.max(start, Math.min(...times));
    end = Math.min(end, Math.max(...times));
  }
  if (start > end) return null;
  const chosen = new Set(trackIds);
  return history.filter(
    (row) => chosen.has(row.trackId) && row.time >= start && row.time <= end,
  );
}
