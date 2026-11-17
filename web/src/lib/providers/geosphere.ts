// GeoSphere Austria: its 1 km model for the Alps and central Europe.

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

/** The dataset's own bounds. */
const AREA = [43.01, 5.04, 51.49, 22.56] as const;

/** Where the wind comes from, from its eastward and northward parts. */
export function windFrom(east: number, north: number): number {
  return ((Math.atan2(-east, -north) * 180) / Math.PI + 360) % 360;
}

export function geosphere(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "geosphere",
    sources: ["geosphere"],
    covers: (location) => insideBox(location, AREA),
    async forecast(location, now) {
      validateLocation(location);
      const params = new URLSearchParams({
        parameters: "2t,10u,10v,tp",
        lat_lon: `${fourDecimals(location.latitude)},${fourDecimals(location.longitude)}`,
      });
      const data = await getJson(
        `https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km?${params}`,
        { fetch: fetchImpl, noCoverageStatuses: [404] },
      );
      const points = readOrFail(formatMessage("GeoSphere Austria"), () => {
        const answer = record(data);
        const times = list(answer.timestamps).map((value) => time(value));
        const parameters = record(
          record(record(list(answer.features)[0]).properties).parameters,
        );
        const series = (name: string) =>
          list(record(parameters[name]).data).map(numberOrNull);
        const temperatures = series("2t");
        const east = series("10u");
        const north = series("10v");
        const rains = series("tp");
        const instants = new Map<number, Instant>();
        const rainByHour = new Map<number, number | null>();
        times.forEach((start, i) => {
          const u = east[i] ?? null;
          const v = north[i] ?? null;
          instants.set(start, {
            temperature: temperatures[i] ?? null,
            windSpeed: u !== null && v !== null ? Math.hypot(u, v) : null,
            windDeg: u !== null && v !== null ? windFrom(u, v) : null,
          });
          // Rain is the total of the hour that ends at the timestamp.
          rainByHour.set(start - HOUR, rains[i] ?? null);
        });
        return hourlyToWindows("geosphere", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
