// SMHI, the Swedish weather service: its point forecast for the Nordic area.

import { getJson, type FetchLike } from "../http.ts";
import {
  HOUR,
  hourlyToWindows,
  keepForecastRange,
  type Instant,
} from "../windows.ts";
import {
  formatMessage,
  fourDecimals,
  insideBox,
  list,
  numberOrNull,
  readOrFail,
  record,
  time,
  validateLocation,
} from "./read.ts";
import type { ForecastProvider } from "./index.ts";

/** Around the forecast's area; SMHI answers 404 for a point outside it. */
const AREA = [52, -2, 73, 40] as const;

/** SMHI marks a missing value with 9999. */
function value(input: unknown): number | null {
  const number = numberOrNull(input);
  return number !== null && number >= 9999 ? null : number;
}

export function smhi(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "smhi",
    sources: ["smhi"],
    covers: (location) => insideBox(location, AREA),
    async forecast(location, now) {
      validateLocation(location);
      const data = await getJson(
        "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point" +
          `/lon/${fourDecimals(location.longitude)}/lat/${fourDecimals(location.latitude)}/data.json`,
        { fetch: fetchImpl, noCoverageStatuses: [404] },
      );
      const points = readOrFail(formatMessage("SMHI"), () => {
        const instants = new Map<number, Instant>();
        const rainByHour = new Map<number, number | null>();
        for (const item of list(record(data).timeSeries)) {
          const entry = record(item);
          const at = time(entry.time);
          const values = record(entry.data);
          instants.set(at, {
            temperature: value(values.air_temperature),
            windSpeed: value(values.wind_speed),
            windDeg: value(values.wind_from_direction),
          });
          // Rain covers the interval that ends at `time`. Only the hourly
          // steps are used; the longer ones further out keep no rain.
          const from =
            entry.intervalParametersStartTime === undefined
              ? null
              : time(entry.intervalParametersStartTime);
          if (from !== null && at - from === HOUR)
            rainByHour.set(from, value(values.precipitation_amount_mean));
        }
        return hourlyToWindows("smhi", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
