// The keyless services: two forecast providers and the rain radar. Each forecast
// provider turns its own answer into ForecastPoints on the same 3-hour UTC windows.

import { getJson, ServiceError, type FetchLike } from "./http.ts";
import type { ForecastPoint, ProviderId, RadarFrame } from "./types.ts";
import {
  FORECAST_DAYS,
  HOUR,
  WINDOW_HOURS,
  isWindowStart,
  keepNextFiveDays,
  sumRain,
} from "./windows.ts";

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
}

export interface ForecastProvider {
  source: ProviderId;
  label: string;
  forecast(location: Location, now: number): Promise<ForecastPoint[]>;
}

/** Stop an unusable location before any request is sent. */
export function validateLocation(location: {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}): void {
  const { name, latitude, longitude } = location;
  if (typeof name !== "string" || name.trim() === "")
    throw new ServiceError("input", "The location has no name.");
  if (typeof latitude !== "number" || typeof longitude !== "number")
    throw new ServiceError("input", `${name} has invalid coordinates.`);
  // Written as "not inside" so NaN is rejected too: every comparison with NaN is false.
  if (
    !(latitude >= -90 && latitude <= 90) ||
    !(longitude >= -180 && longitude <= 180)
  )
    throw new ServiceError(
      "input",
      `${name} has coordinates outside the valid range.`,
    );
}

// Small readers that turn a missing or mistyped field into one format error.
class FormatError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new FormatError();
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new FormatError();
  return value;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new FormatError();
  return value;
}

function time(value: unknown, assumeUtc = false): number {
  if (typeof value !== "string") throw new FormatError();
  const text =
    assumeUtc && !/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value + "Z" : value;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) throw new FormatError();
  return parsed;
}

function readOrFail<T>(message: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof FormatError || error instanceof TypeError)
      throw new ServiceError("format", message);
    throw error;
  }
}

/** Open-Meteo: free, no key, hourly values. */
export function openMeteo(fetchImpl?: FetchLike): ForecastProvider {
  return {
    source: "open-meteo",
    label: "Open-Meteo",
    async forecast(location, now) {
      validateLocation(location);
      const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        hourly:
          "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation",
        wind_speed_unit: "ms",
        timezone: "UTC",
        // One extra day, so the 5-day cut below always has enough.
        forecast_days: String(FORECAST_DAYS + 1),
      });
      const data = await getJson(
        `https://api.open-meteo.com/v1/forecast?${params}`,
        { fetch: fetchImpl },
      );
      const points = readOrFail(
        "Open-Meteo sent a forecast in an unexpected format.",
        () => {
          const hourly = record(record(data).hourly);
          const times = list(hourly.time);
          const temperatures = list(hourly.temperature_2m);
          const windSpeeds = list(hourly.wind_speed_10m);
          const windDirections = list(hourly.wind_direction_10m);
          const rains = list(hourly.precipitation);
          const result: ForecastPoint[] = [];
          for (let i = 0; i < times.length; i++) {
            // Open-Meteo sends "2026-11-16T03:00" without a zone; we asked for UTC.
            const start = time(times[i], true);
            if (!isWindowStart(start)) continue;
            // The window needs the 3 hours after its start in the answer.
            if (i + WINDOW_HOURS >= times.length) break;
            // Rain at 03:00 fell from 02:00 to 03:00, so the window
            // 00:00-03:00 is the values at 01:00, 02:00 and 03:00.
            const rain = sumRain([
              numberOrNull(rains[i + 1]),
              numberOrNull(rains[i + 2]),
              numberOrNull(rains[i + 3]),
            ]);
            result.push({
              source: "open-meteo",
              time: start,
              temperature: numberOrNull(temperatures[i]),
              windSpeed: numberOrNull(windSpeeds[i]),
              windDeg: numberOrNull(windDirections[i]),
              rain,
            });
          }
          return result;
        },
      );
      return keepNextFiveDays(points, now);
    },
  };
}

/** Round to MET's 4-decimal limit for coordinates. */
function fourDecimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * MET Norway Locationforecast: free, no key. Its terms ask for a User-Agent naming
 * the app; browsers cannot set one, so the desktop app adds it to MET requests.
 */
export function metNorway(fetchImpl?: FetchLike): ForecastProvider {
  return {
    source: "met-norway",
    label: "MET Norway",
    async forecast(location, now) {
      validateLocation(location);
      const params = new URLSearchParams({
        lat: String(fourDecimals(location.latitude)),
        lon: String(fourDecimals(location.longitude)),
      });
      const data = await getJson(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`,
        { fetch: fetchImpl },
      );
      const points = readOrFail(
        "MET Norway sent a forecast in an unexpected format.",
        () => {
          const timeseries = list(record(record(data).properties).timeseries);
          // First note the rain of every hour that has one. Further out, MET only
          // sends 6-hour blocks without next_1_hours, so those hours are not noted.
          const rainByHour = new Map<number, number | null>();
          for (const entry of timeseries) {
            const values = record(record(entry).data);
            if (values.next_1_hours !== undefined) {
              const details = record(record(values.next_1_hours).details);
              rainByHour.set(
                time(record(entry).time),
                numberOrNull(details.precipitation_amount),
              );
            }
          }
          const result: ForecastPoint[] = [];
          for (const entry of timeseries) {
            const start = time(record(entry).time);
            if (!isWindowStart(start)) continue;
            // A window is used only when all 3 of its hours are hourly data.
            const hours = [start, start + HOUR, start + 2 * HOUR];
            if (!hours.every((hour) => rainByHour.has(hour))) continue;
            // next_1_hours at 00:00 is the rain from 00:00 to 01:00,
            // so the window 00:00-03:00 adds up 00:00, 01:00 and 02:00.
            const rain = sumRain(hours.map((hour) => rainByHour.get(hour)));
            const details = record(
              record(record(record(entry).data).instant).details,
            );
            result.push({
              source: "met-norway",
              time: start,
              temperature: numberOrNull(details.air_temperature),
              windSpeed: numberOrNull(details.wind_speed),
              windDeg: numberOrNull(details.wind_from_direction),
              rain,
            });
          }
          return result;
        },
      );
      return keepNextFiveDays(points, now);
    },
  };
}

export function defaultProviders(): ForecastProvider[] {
  return [openMeteo(), metNorway()];
}

// RainViewer's image settings: 256-pixel tiles, colour scheme 2, smoothed, with snow shown.
const TILE_SETTINGS = "/256/{z}/{x}/{y}/2/1_1.png";
const RADAR_FORMAT = "RainViewer sent its radar list in an unexpected format.";

/** Every radar image of the last 2 hours, oldest first. */
export async function radarFrames(
  fetchImpl?: FetchLike,
): Promise<RadarFrame[]> {
  const data = await getJson(
    "https://api.rainviewer.com/public/weather-maps.json",
    { fetch: fetchImpl },
  );
  const frames = readOrFail(RADAR_FORMAT, () => {
    const answer = record(data);
    const host = answer.host;
    if (typeof host !== "string") throw new FormatError();
    return list(record(answer.radar).past).map((item) => {
      const image = record(item);
      const seconds = numberOrNull(image.time);
      if (seconds === null || typeof image.path !== "string")
        throw new FormatError();
      return { time: seconds * 1000, url: host + image.path + TILE_SETTINGS };
    });
  });
  // An empty list would leave the map with nothing to show, so it counts as a bad answer.
  if (frames.length === 0) throw new ServiceError("format", RADAR_FORMAT);
  return frames;
}
