// MET Norway Locationforecast. Its terms ask for a User-Agent naming the app;
// browsers cannot set one, so the desktop app adds it to every request.

import { getJson, type FetchLike } from "../http.ts";
import {
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

export function metNorway(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "met-norway",
    sources: ["met-norway"],
    async forecast(location, now) {
      validateLocation(location);
      // MET refuses coordinates with more than 4 decimals.
      const params = new URLSearchParams({
        lat: String(fourDecimals(location.latitude)),
        lon: String(fourDecimals(location.longitude)),
      });
      const data = await getJson(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`,
        { fetch: fetchImpl },
      );
      const points = readOrFail(formatMessage("MET Norway"), () => {
        const timeseries = list(record(record(data).properties).timeseries);
        const instants = new Map<number, Instant>();
        const rainByHour = new Map<number, number | null>();
        for (const entry of timeseries) {
          const start = time(record(entry).time);
          const values = record(record(entry).data);
          const details = record(record(values.instant).details);
          instants.set(start, {
            temperature: numberOrNull(details.air_temperature),
            windSpeed: numberOrNull(details.wind_speed),
            windDeg: numberOrNull(details.wind_from_direction),
          });
          // next_1_hours at 00:00 is the rain from 00:00 to 01:00. Further out
          // MET only sends 6-hour blocks, and those windows keep no rain.
          if (values.next_1_hours !== undefined)
            rainByHour.set(
              start,
              numberOrNull(
                record(record(values.next_1_hours).details)
                  .precipitation_amount,
              ),
            );
        }
        return hourlyToWindows("met-norway", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
