// Bright Sky: a free JSON service for the DWD's open data. For a forecast it
// answers with MOSMIX, the DWD's station forecast, from the nearest station.

import { getJson, type FetchLike } from "../http.ts";
import {
  DAY,
  FORECAST_DAYS,
  HOUR,
  hourlyToWindows,
  keepForecastRange,
  windowStart,
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

const KMH_TO_MS = 1 / 3.6;

export function brightSky(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "bright-sky",
    sources: ["dwd-mosmix"],
    async forecast(location, now) {
      validateLocation(location);
      const first = windowStart(now);
      const params = new URLSearchParams({
        lat: String(fourDecimals(location.latitude)),
        lon: String(fourDecimals(location.longitude)),
        date: new Date(first).toISOString(),
        last_date: new Date(first + FORECAST_DAYS * DAY).toISOString(),
        tz: "Etc/UTC",
      });
      const data = await getJson(
        `https://api.brightsky.dev/weather?${params}`,
        // 404: no DWD station within 50 km of this place.
        { fetch: fetchImpl, noCoverageStatuses: [404] },
      );
      const points = readOrFail(formatMessage("Bright Sky"), () => {
        const instants = new Map<number, Instant>();
        const rainByHour = new Map<number, number | null>();
        for (const item of list(record(data).weather)) {
          const row = record(item);
          const at = time(row.timestamp);
          const windKmh = numberOrNull(row.wind_speed);
          instants.set(at, {
            temperature: numberOrNull(row.temperature),
            windSpeed: windKmh === null ? null : windKmh * KMH_TO_MS,
            windDeg: numberOrNull(row.wind_direction),
          });
          // Precipitation is the total of the hour that ends at the timestamp.
          rainByHour.set(at - HOUR, numberOrNull(row.precipitation));
        }
        return hourlyToWindows("dwd-mosmix", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
