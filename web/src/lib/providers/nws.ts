// The US National Weather Service: the forecasters' own gridded forecast, for
// places in the United States. Two steps: the grid cell of a point, then its data.

import { getJson, type FetchLike } from "../http.ts";
import {
  HOUR,
  hourlyToWindows,
  keepForecastRange,
  type Instant,
} from "../windows.ts";
import {
  FormatError,
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

/** The 50 states and Puerto Rico; places in this box but outside the US answer 404. */
const AREA = [17, -180, 72, -64] as const;
const GRID = "https://api.weather.gov/gridpoints/";
const LABEL = "The National Weather Service";

/** "PT6H", "P1DT12H" and so on, in whole hours (at least one). */
export function durationHours(text: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(text);
  if (!match || text === "P") throw new FormatError();
  const hours =
    Number(match[1] ?? 0) * 24 +
    Number(match[2] ?? 0) +
    Number(match[3] ?? 0) / 60;
  return Math.max(1, Math.round(hours));
}

/** A grid layer as one value per hour. A total is shared evenly over its hours. */
function hourly(
  layer: unknown,
  convert: (value: number, unit: string) => number,
  total = false,
): Map<number, number | null> {
  const { uom, values } = record(layer);
  const unit = typeof uom === "string" ? uom.replace(/^.*:/, "") : "";
  const result = new Map<number, number | null>();
  for (const item of list(values)) {
    const { validTime, value } = record(item);
    if (typeof validTime !== "string") throw new FormatError();
    const [start, duration] = validTime.split("/");
    const from = time(start);
    const hours = durationHours(duration ?? "");
    const amount = numberOrNull(value);
    const converted = amount === null ? null : convert(amount, unit);
    for (let hour = 0; hour < hours; hour++)
      result.set(
        from + hour * HOUR,
        converted === null ? null : total ? converted / hours : converted,
      );
  }
  return result;
}

function celsius(value: number, unit: string): number {
  if (unit === "degC") return value;
  if (unit === "degF") return ((value - 32) * 5) / 9;
  throw new FormatError();
}

function metresPerSecond(value: number, unit: string): number {
  if (unit === "km_h-1") return value / 3.6;
  if (unit === "m_s-1") return value;
  throw new FormatError();
}

function millimetres(value: number, unit: string): number {
  if (unit === "mm") return value;
  if (unit === "m") return value * 1000;
  throw new FormatError();
}

export function nws(fetchImpl?: FetchLike): ForecastProvider {
  // The grid cell of a place does not change, so it is asked for once.
  const grids = new Map<string, string>();
  return {
    id: "nws",
    sources: ["nws"],
    covers: (location) => insideBox(location, AREA),
    async forecast(location, now) {
      validateLocation(location);
      const point = `${fourDecimals(location.latitude)},${fourDecimals(location.longitude)}`;
      let grid = grids.get(point);
      if (!grid) {
        const answer = await getJson(
          `https://api.weather.gov/points/${point}`,
          { fetch: fetchImpl, noCoverageStatuses: [404] },
        );
        grid = readOrFail(formatMessage(LABEL), () => {
          const url = record(record(answer).properties).forecastGridData;
          // Only ever follow a link to the service's own grid data.
          if (typeof url !== "string" || !url.startsWith(GRID))
            throw new FormatError();
          return url;
        });
        grids.set(point, grid);
      }
      const data = await getJson(grid, { fetch: fetchImpl });
      const points = readOrFail(formatMessage(LABEL), () => {
        const layers = record(record(data).properties);
        const temperatures = hourly(layers.temperature, celsius);
        const windSpeeds = hourly(layers.windSpeed, metresPerSecond);
        const windDirections = hourly(layers.windDirection, (value) => value);
        // Rain comes as totals over up to 6 hours, shared evenly here.
        const rainByHour = hourly(
          layers.quantitativePrecipitation,
          millimetres,
          true,
        );
        const instants = new Map<number, Instant>();
        for (const [at, value] of temperatures)
          instants.set(at, {
            temperature: value,
            windSpeed: windSpeeds.get(at) ?? null,
            windDeg: windDirections.get(at) ?? null,
          });
        return hourlyToWindows("nws", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
