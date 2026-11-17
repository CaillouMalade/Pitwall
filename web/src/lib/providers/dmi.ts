// DMI, the Danish Meteorological Institute: its Harmonie model for north-west
// Europe, read from the open-data forecast service (CoverageJSON).

import { getJson, MESSAGES, ServiceError, type FetchLike } from "../http.ts";
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

/** Generously around the model's area. */
const AREA = [30, -45, 78, 45] as const;
/** Outside its area DMI answers with its nearest grid point, however far away. */
const MAX_OFFSET_DEGREES = 0.1;
const KELVIN = 273.15;
/** Totals wobble by less than this from rounding alone. */
const ROUNDING = 0.01;

export function dmi(fetchImpl?: FetchLike): ForecastProvider {
  return {
    id: "dmi",
    sources: ["dmi-harmonie"],
    covers: (location) => insideBox(location, AREA),
    async forecast(location, now) {
      validateLocation(location);
      const latitude = fourDecimals(location.latitude);
      const longitude = fourDecimals(location.longitude);
      const params = new URLSearchParams({
        coords: `POINT(${longitude} ${latitude})`,
        crs: "crs84",
        "parameter-name":
          "temperature-2m,wind-speed-10m,wind-dir-10m,total-precipitation",
        f: "CoverageJSON",
      });
      const data = await getJson(
        `https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position?${params}`,
        { fetch: fetchImpl, noCoverageStatuses: [404] },
      );
      const points = readOrFail(formatMessage("DMI"), () => {
        const axes = record(record(record(data).domain).axes);
        const first = (axis: unknown) =>
          numberOrNull(list(record(axis).values)[0]) ?? Number.NaN;
        if (
          !(Math.abs(first(axes.x) - longitude) <= MAX_OFFSET_DEGREES) ||
          !(Math.abs(first(axes.y) - latitude) <= MAX_OFFSET_DEGREES)
        )
          throw new ServiceError("no-coverage", MESSAGES.noCoverage);
        const times = list(record(axes.t).values).map((value) => time(value));
        const ranges = record(record(data).ranges);
        const series = (name: string) =>
          list(record(ranges[name]).values).map(numberOrNull);
        const temperatures = series("temperature-2m");
        const windSpeeds = series("wind-speed-10m");
        const windDirections = series("wind-dir-10m");
        const rainTotals = series("total-precipitation");
        const instants = new Map<number, Instant>();
        const rainByHour = new Map<number, number | null>();
        times.forEach((start, i) => {
          const kelvin = temperatures[i] ?? null;
          instants.set(start, {
            temperature: kelvin === null ? null : kelvin - KELVIN,
            windSpeed: windSpeeds[i] ?? null,
            windDeg: windDirections[i] ?? null,
          });
          // Rain is a running total since the start of a model run, so an
          // hour's rain is the step to the next total. Where the total drops
          // a new run starts, and that hour's rain is not known.
          const before = rainTotals[i] ?? null;
          const after = rainTotals[i + 1] ?? null;
          if (i + 1 < times.length && times[i + 1] - start === HOUR) {
            const step =
              before === null || after === null ? null : after - before;
            rainByHour.set(
              start,
              step === null || step < -ROUNDING ? null : Math.max(0, step),
            );
          }
        });
        return hourlyToWindows("dmi-harmonie", instants, rainByHour);
      });
      return keepForecastRange(points, now);
    },
  };
}
