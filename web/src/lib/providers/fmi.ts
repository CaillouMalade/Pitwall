// FMI, the Finnish Meteorological Institute: its Harmonie forecast for northern
// Europe, read from the open-data WFS service (XML).

import { getText, ServiceError, type FetchLike } from "../http.ts";
import {
  DAY,
  HOUR,
  hourlyToWindows,
  keepForecastRange,
  windowStart,
  type Instant,
} from "../windows.ts";
import {
  formatMessage,
  fourDecimals,
  insideBox,
  validateLocation,
} from "./read.ts";
import type { ForecastProvider } from "./index.ts";

/** Around the model's area; FMI answers 400 for a point outside it. */
const AREA = [53, 0, 72, 35] as const;
/** The model runs about 66 hours ahead. */
const AHEAD = 3 * DAY;

const ELEMENT =
  /<BsWfs:Time>([^<]+)<\/BsWfs:Time>\s*<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>\s*<BsWfs:ParameterValue>([^<]*)<\/BsWfs:ParameterValue>/g;

/** One value per time and parameter name; "NaN" becomes null. */
export function readFmi(
  xml: string,
): Map<number, Record<string, number | null>> {
  const rows = new Map<number, Record<string, number | null>>();
  for (const [, timeText, name, valueText] of xml.matchAll(ELEMENT)) {
    const at = Date.parse(timeText.trim());
    if (Number.isNaN(at)) continue;
    const text = valueText.trim();
    const value = Number(text);
    const row = rows.get(at) ?? {};
    row[name.trim()] = text !== "" && Number.isFinite(value) ? value : null;
    rows.set(at, row);
  }
  return rows;
}

const stamp = (time: number) => new Date(time).toISOString().slice(0, 19) + "Z";

export function fmi(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "fmi",
    sources: ["fmi-harmonie"],
    covers: (location) => insideBox(location, AREA),
    async forecast(location, now) {
      validateLocation(location);
      const first = windowStart(now);
      const params = new URLSearchParams({
        service: "WFS",
        version: "2.0.0",
        request: "getFeature",
        storedquery_id: "fmi::forecast::harmonie::surface::point::simple",
        latlon: `${fourDecimals(location.latitude)},${fourDecimals(location.longitude)}`,
        parameters: "Temperature,WindSpeedMS,WindDirection,Precipitation1h",
        timestep: "60",
        starttime: stamp(first),
        endtime: stamp(first + AHEAD),
      });
      const xml = await getText(`https://opendata.fmi.fi/wfs?${params}`, {
        fetch: fetchImpl,
        noCoverageStatuses: [400],
      });
      const rows = readFmi(xml);
      if (rows.size === 0)
        throw new ServiceError("format", formatMessage("FMI"));
      const instants = new Map<number, Instant>();
      const rainByHour = new Map<number, number | null>();
      for (const [at, row] of rows) {
        instants.set(at, {
          temperature: row.Temperature ?? null,
          windSpeed: row.WindSpeedMS ?? null,
          windDeg: row.WindDirection ?? null,
        });
        // Precipitation1h is the total of the hour that ends at the time.
        if ("Precipitation1h" in row)
          rainByHour.set(at - HOUR, row.Precipitation1h);
      }
      return keepForecastRange(
        hourlyToWindows("fmi-harmonie", instants, rainByHour),
        now,
      );
    },
  };
}
