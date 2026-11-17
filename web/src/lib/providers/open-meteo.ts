// Open-Meteo: one request returns the forecasts of many national weather models.

import { getJson, type FetchLike } from "../http.ts";
import type { ForecastPoint } from "../types.ts";
import {
  FORECAST_DAYS,
  HOUR,
  hourlyToWindows,
  keepForecastRange,
  type Instant,
} from "../windows.ts";
import {
  formatMessage,
  fourDecimals,
  list,
  numberOrNull,
  readOrFail,
  record,
  time,
  validateLocation,
} from "./read.ts";
import type { ForecastProvider } from "./index.ts";

/** Open-Meteo's model name and the source it becomes. */
export const OPEN_METEO_MODELS: readonly (readonly [string, string])[] = [
  ["ecmwf_ifs025", "ecmwf-ifs"],
  ["ecmwf_aifs025_single", "ecmwf-aifs"],
  ["gfs_seamless", "noaa-gfs"],
  ["icon_seamless", "dwd-icon"],
  ["meteofrance_seamless", "meteofrance"],
  ["ukmo_seamless", "ukmo"],
  ["gem_seamless", "eccc-gem"],
  ["jma_seamless", "jma"],
  ["cma_grapes_global", "cma-grapes"],
  // Regional models: Open-Meteo leaves them out, or empty, outside their area.
  ["knmi_harmonie_arome_europe", "knmi-harmonie"],
  ["meteoswiss_icon_seamless", "meteoswiss-icon"],
  ["italia_meteo_arpae_icon_2i", "italiameteo-icon"],
];

const VARIABLES = [
  "temperature_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "precipitation",
] as const;

export function openMeteo(
  fetchImpl?: FetchLike,
  models: readonly (readonly [string, string])[] = OPEN_METEO_MODELS,
): ForecastProvider {
  return {
    id: "open-meteo",
    sources: models.map(([, source]) => source),
    async forecast(location, now) {
      validateLocation(location);
      const params = new URLSearchParams({
        latitude: String(fourDecimals(location.latitude)),
        longitude: String(fourDecimals(location.longitude)),
        hourly: VARIABLES.join(","),
        wind_speed_unit: "ms",
        timezone: "UTC",
        // One extra day, so the cut below always has enough.
        forecast_days: String(FORECAST_DAYS + 1),
        models: models.map(([model]) => model).join(","),
      });
      const data = await getJson(
        `https://api.open-meteo.com/v1/forecast?${params}`,
        { fetch: fetchImpl },
      );
      const points = readOrFail(formatMessage("Open-Meteo"), () => {
        const hourly = record(record(data).hourly);
        // Open-Meteo sends "2026-11-16T03:00" without a zone; we asked for UTC.
        const times = list(hourly.time).map((value) => time(value, true));
        const result: ForecastPoint[] = [];
        for (const [model, source] of models) {
          // With one model the names have no suffix.
          const series = (name: string) =>
            hourly[`${name}_${model}`] ??
            (models.length === 1 ? hourly[name] : undefined);
          if (VARIABLES.every((name) => series(name) === undefined)) continue;
          const [temperatures, windSpeeds, windDirections, rains] =
            VARIABLES.map((name) => list(series(name)));
          const instants = new Map<number, Instant>();
          const rainByHour = new Map<number, number | null>();
          times.forEach((start, i) => {
            instants.set(start, {
              temperature: numberOrNull(temperatures[i]),
              windSpeed: numberOrNull(windSpeeds[i]),
              windDeg: numberOrNull(windDirections[i]),
            });
            // Rain at 03:00 fell from 02:00 to 03:00.
            rainByHour.set(start - HOUR, numberOrNull(rains[i]));
          });
          result.push(...hourlyToWindows(source, instants, rainByHour));
        }
        return result;
      });
      return keepForecastRange(points, now);
    },
  };
}
