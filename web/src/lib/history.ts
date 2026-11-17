// Past weather by day, for the History and Track comparison pages. The days come
// from the reanalysis archive (history-source.ts) or, when that cannot be reached,
// from the observations bundled with the app, read here.

export interface Observation {
  time: number;
  trackId: string;
  track: string;
  temperature: number | null;
  /** Rolling one-hour total in mm; null when the logger had none. */
  rain: number | null;
}

/** A track needs at least this many days before its history is drawn. */
export const MIN_DAYS = 2;

/** A day counts as a rain day from 1 mm, the usual definition of a wet day. */
export const RAIN_DAY_MM = 1;

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

export interface DailyWeather {
  day: string;
  temperatureMin: number | null;
  temperatureMax: number | null;
  temperatureMean: number | null;
  /** The day's rain in mm. */
  rain: number | null;
  /** Highest minus lowest temperature of the day. */
  temperatureRange: number | null;
  /** The day's strongest wind in m/s; the bundled observations have none. */
  windMax: number | null;
}

const mean = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/** The bundled observations of one track as days, oldest first. */
export function observedDays(
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
        windMax: null,
      };
    });
}

/** Where a track's days came from. */
export type HistoryOrigin = "archive" | "bundled";

export interface TrackHistory {
  trackId: string;
  origin: HistoryOrigin;
  days: DailyWeather[];
}

export class TrackSummary {
  constructor(
    readonly trackId: string,
    readonly track: string,
    readonly averageTemperature: number | null,
    readonly rainDays: number,
    readonly totalRain: number,
    readonly days: number,
    /** In m/s; null when no day has a wind value. */
    readonly strongestWind: number | null,
  ) {}

  toString(): string {
    const average =
      this.averageTemperature === null
        ? "no temperature"
        : `average ${this.averageTemperature.toFixed(1)} °C`;
    return `${this.track}: ${average}, ${this.rainDays} rain days, ${this.totalRain.toFixed(1)} mm total rain over ${this.days} days.`;
  }
}

const numbers = (values: (number | null)[]) =>
  values.filter((value): value is number => value !== null);

export function summarise(
  trackId: string,
  track: string,
  days: readonly DailyWeather[],
): TrackSummary {
  const rains = numbers(days.map((day) => day.rain));
  const winds = numbers(days.map((day) => day.windMax));
  return new TrackSummary(
    trackId,
    track,
    mean(numbers(days.map((day) => day.temperatureMean))),
    rains.filter((rain) => rain >= RAIN_DAY_MM).length,
    rains.reduce((sum, rain) => sum + rain, 0),
    days.length,
    winds.length ? Math.max(...winds) : null,
  );
}

/** Wettest first. A stable sort keeps the given order for the same rain. */
export function rankByRain(summaries: readonly TrackSummary[]): TrackSummary[] {
  return [...summaries].sort((a, b) => b.totalRain - a.totalRain);
}

/** The days every one of the histories has, oldest first, so tracks are compared fairly. */
export function sharedDays(histories: readonly TrackHistory[]): string[] {
  if (histories.length === 0) return [];
  const [first, ...others] = histories.map(
    (history) => new Set(history.days.map((day) => day.day)),
  );
  return [...first]
    .filter((day) => others.every((days) => days.has(day)))
    .sort();
}

/** One history cut down to the given days. */
export function onDays(
  history: TrackHistory,
  days: readonly string[],
): DailyWeather[] {
  const wanted = new Set(days);
  return history.days.filter((day) => wanted.has(day.day));
}
