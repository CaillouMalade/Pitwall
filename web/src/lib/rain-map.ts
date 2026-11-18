// A forecast of rain on a small grid around a track, in 15-minute steps, for the
// map on the Session dashboard. It comes from Open-Meteo's "best match" model
// mix in one request, so it is one forecast, not the combination of all sources.

import { getJson, ServiceError, type FetchLike } from "./http.ts";
import {
  fourDecimals,
  list,
  numberOrNull,
  readOrFail,
  record,
  time,
  validateLocation,
  type Location,
} from "./providers/read.ts";

export const QUARTER = 15 * 60_000;
/** Points per side, and the distance between them. 7 × 7 at 8 km covers ±24 km. */
export const GRID_SIZE = 7;
export const GRID_STEP_KM = 8;
/** The longest period one map covers. */
export const MAX_STEPS = 6 * 4 * 2;

const FORMAT = "The rain forecast map came back in an unexpected format.";

export interface RainGrid {
  /** South-west and north-east corners of the outer grid points. */
  south: number;
  west: number;
  north: number;
  east: number;
  size: number;
  /** Start of each 15-minute step. */
  times: number[];
  /**
   * mm in each step, per time: rows from north to south, each west to east.
   * Null where the model has no value.
   */
  frames: (number | null)[][];
}

/** The grid's points, rows from north to south, each west to east. */
export function gridPoints(
  location: { latitude: number; longitude: number },
  size = GRID_SIZE,
  stepKm = GRID_STEP_KM,
): { latitude: number; longitude: number }[] {
  const half = (size - 1) / 2;
  const latStep = stepKm / 110.57;
  // A degree of longitude shrinks towards the poles; never divide by zero there.
  const lonStep =
    stepKm /
    (111.32 * Math.max(0.1, Math.cos((location.latitude * Math.PI) / 180)));
  const points = [];
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++)
      points.push({
        latitude: Math.max(
          -89.9,
          Math.min(89.9, location.latitude + (half - row) * latStep),
        ),
        longitude:
          ((((location.longitude + (column - half) * lonStep + 180) % 360) +
            360) %
            360) -
          180,
      });
  return points;
}

const stamp = (at: number) => new Date(at).toISOString().slice(0, 16);

/** Rain around a place from `start` to `end`, in 15-minute steps. */
export async function fetchRainGrid(
  location: Location,
  start: number,
  end: number,
  fetchImpl?: FetchLike,
): Promise<RainGrid> {
  validateLocation(location);
  const first = Math.floor(start / QUARTER) * QUARTER;
  const last = Math.min(
    Math.ceil(end / QUARTER) * QUARTER,
    first + MAX_STEPS * QUARTER,
  );
  const points = gridPoints(location);
  const params = new URLSearchParams({
    latitude: points.map((point) => fourDecimals(point.latitude)).join(","),
    longitude: points.map((point) => fourDecimals(point.longitude)).join(","),
    minutely_15: "precipitation",
    start_minutely_15: stamp(first),
    end_minutely_15: stamp(last),
    timezone: "UTC",
  });
  const data = await getJson(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { fetch: fetchImpl },
  );
  const grid = readOrFail(FORMAT, () => {
    const places = list(data);
    if (places.length !== points.length) throw new TypeError();
    const series = places.map((place) => record(record(place).minutely_15));
    const times = list(series[0].time).map((value) => time(value, true));
    const rains = series.map((item) =>
      list(item.precipitation).map(numberOrNull),
    );
    return {
      south: points.at(-1)!.latitude,
      west: points[0].longitude,
      north: points[0].latitude,
      east: points.at(-1)!.longitude,
      size: GRID_SIZE,
      times,
      frames: times.map((_, step) => rains.map((rain) => rain[step] ?? null)),
    };
  });
  if (grid.times.length === 0) throw new ServiceError("format", FORMAT);
  return grid;
}

/** The series of the grid's middle point: the track itself. */
export function centreSeries(
  grid: RainGrid,
): { time: number; rain: number | null }[] {
  const middle = Math.floor((grid.size * grid.size) / 2);
  return grid.times.map((at, step) => ({
    time: at,
    rain: grid.frames[step][middle],
  }));
}

/** The frame that covers a moment: the last step that started before it. */
export function frameAt(grid: RainGrid, at: number): number {
  let index = 0;
  for (let i = 0; i < grid.times.length; i++)
    if (grid.times[i] <= at) index = i;
  return index;
}

/**
 * Colours for rain as a rate in mm/h, the way radar maps draw it: from light
 * blue for drizzle to red and purple for a downpour. [from mm/h, r, g, b, alpha].
 */
export const RAIN_SCALE: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
])[] = [
  [0.1, 150, 200, 255, 0.0],
  [0.3, 120, 185, 255, 0.45],
  [1, 60, 140, 245, 0.62],
  [2.5, 40, 190, 150, 0.7],
  [5, 250, 215, 60, 0.76],
  [10, 245, 135, 45, 0.8],
  [20, 225, 55, 55, 0.84],
  [40, 175, 55, 190, 0.88],
];

/** The colour of a rain rate, blended between the steps of the scale. */
export function rainColour(rate: number): [number, number, number, number] {
  if (!(rate > RAIN_SCALE[0][0])) return [0, 0, 0, 0];
  for (let i = 1; i < RAIN_SCALE.length; i++) {
    const [to, r2, g2, b2, a2] = RAIN_SCALE[i];
    if (rate <= to) {
      const [from, r1, g1, b1, a1] = RAIN_SCALE[i - 1];
      // Rain rates are spread over decades, so blend on a log scale.
      const f = Math.log(rate / from) / Math.log(to / from);
      return [
        r1 + (r2 - r1) * f,
        g1 + (g2 - g1) * f,
        b1 + (b2 - b1) * f,
        a1 + (a2 - a1) * f,
      ];
    }
  }
  const [, r, g, b, a] = RAIN_SCALE.at(-1)!;
  return [r, g, b, a];
}

/**
 * One frame stretched to `pixels` × `pixels`, as mm/h. Values between the grid
 * points are blended from the four around them; a missing point counts as dry.
 */
export function interpolateFrame(
  frame: readonly (number | null)[],
  size: number,
  pixels: number,
): Float32Array {
  const out = new Float32Array(pixels * pixels);
  const at = (row: number, column: number) =>
    (frame[row * size + column] ?? 0) * 4;
  for (let y = 0; y < pixels; y++) {
    const gy = (y / (pixels - 1)) * (size - 1);
    const row = Math.min(size - 2, Math.floor(gy));
    const fy = gy - row;
    for (let x = 0; x < pixels; x++) {
      const gx = (x / (pixels - 1)) * (size - 1);
      const column = Math.min(size - 2, Math.floor(gx));
      const fx = gx - column;
      out[y * pixels + x] =
        at(row, column) * (1 - fx) * (1 - fy) +
        at(row, column + 1) * fx * (1 - fy) +
        at(row + 1, column) * (1 - fx) * fy +
        at(row + 1, column + 1) * fx * fy;
    }
  }
  return out;
}

/** The time zone of a place, from Open-Meteo. */
export async function fetchZone(
  location: { latitude: number; longitude: number },
  fetchImpl?: FetchLike,
): Promise<string> {
  const params = new URLSearchParams({
    latitude: String(fourDecimals(location.latitude)),
    longitude: String(fourDecimals(location.longitude)),
    daily: "temperature_2m_max",
    forecast_days: "1",
    timezone: "auto",
  });
  const data = await getJson(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { fetch: fetchImpl },
  );
  const zone = readOrFail(FORMAT, () => record(data).timezone);
  if (typeof zone !== "string" || zone === "")
    throw new ServiceError("format", "The time zone could not be read.");
  return zone;
}
