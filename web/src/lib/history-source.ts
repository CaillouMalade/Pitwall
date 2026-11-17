// Past weather for any place, from Open-Meteo's Historical Weather API: the
// ERA5 and ECMWF IFS reanalysis, which is a model's reconstruction of the weather
// on a grid of a few kilometres, not a gauge at the track.

import { getJson, ServiceError, type FetchLike } from "./http.ts";
import { utcDay, type DailyWeather } from "./history.ts";
import {
  fourDecimals,
  list,
  numberOrNull,
  readOrFail,
  record,
  validateLocation,
  type Location,
} from "./providers/read.ts";
import { DAY } from "./windows.ts";

export const HISTORY_PERIODS = [14, 30, 90] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

const FORMAT = "The weather archive sent an answer in an unexpected format.";

/** The last `days` full days before today (UTC), oldest first. */
export async function fetchHistory(
  location: Location,
  days: number,
  now: number = Date.now(),
  fetchImpl?: FetchLike,
): Promise<DailyWeather[]> {
  validateLocation(location);
  const today = Math.floor(now / DAY) * DAY;
  const params = new URLSearchParams({
    latitude: String(fourDecimals(location.latitude)),
    longitude: String(fourDecimals(location.longitude)),
    start_date: utcDay(today - days * DAY),
    end_date: utcDay(today - DAY),
    daily:
      "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max",
    wind_speed_unit: "ms",
    timezone: "UTC",
  });
  const data = await getJson(
    `https://archive-api.open-meteo.com/v1/archive?${params}`,
    { fetch: fetchImpl },
  );
  const result = readOrFail(FORMAT, () => {
    const daily = record(record(data).daily);
    const series = (name: string) => list(daily[name]).map(numberOrNull);
    const highs = series("temperature_2m_max");
    const lows = series("temperature_2m_min");
    const means = series("temperature_2m_mean");
    const rains = series("precipitation_sum");
    const winds = series("wind_speed_10m_max");
    return list(daily.time).map((day, i): DailyWeather => {
      if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day))
        throw new TypeError();
      const min = lows[i] ?? null;
      const max = highs[i] ?? null;
      return {
        day,
        temperatureMin: min,
        temperatureMax: max,
        temperatureMean: means[i] ?? null,
        rain: rains[i] ?? null,
        temperatureRange: min === null || max === null ? null : max - min,
        windMax: winds[i] ?? null,
      };
    });
  });
  // The newest days can still be empty; a day with nothing at all is left out.
  const known = result.filter(
    (day) =>
      day.temperatureMin !== null ||
      day.temperatureMax !== null ||
      day.rain !== null,
  );
  if (known.length === 0) throw new ServiceError("format", FORMAT);
  return known;
}
