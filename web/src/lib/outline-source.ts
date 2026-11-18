// The outline of a track the user added, from OpenStreetMap through the
// Overpass API: every piece of racetrack within 2.5 km of its coordinates. The
// built-in circuits come with their outline and never ask.

import { ServiceError, TIMEOUT_MS, type FetchLike } from "./http.ts";
import type { LatLon } from "./outline.ts";
import {
  fourDecimals,
  list,
  readOrFail,
  record,
  validateLocation,
  type Location,
} from "./providers/read.ts";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const FORMAT = "The track outline came back in an unexpected format.";
export const OUTLINE_RADIUS_M = 2500;
/** More than this is a whole region's worth of tracks, not one circuit. */
const MAX_POINTS = 6000;

/** The lines of racetrack near a place; empty when the map has none there. */
export async function fetchTrackLines(
  location: Location,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<LatLon[][]> {
  validateLocation(location);
  const query = `[out:json][timeout:20];way[highway=raceway](around:${OUTLINE_RADIUS_M},${fourDecimals(location.latitude)},${fourDecimals(location.longitude)});out tags geom;`;
  let response: Response;
  try {
    response = await fetchImpl(
      `${OVERPASS}?data=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS * 2) },
    );
  } catch {
    throw new ServiceError(
      "offline",
      "The track outline could not be fetched.",
    );
  }
  if (response.status !== 200)
    throw new ServiceError(
      "status",
      "The track outline could not be fetched right now.",
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ServiceError("unreadable", FORMAT);
  }
  return readOrFail(FORMAT, () => {
    const lines: LatLon[][] = [];
    let points = 0;
    for (const element of list(record(data).elements)) {
      const way = record(element);
      const tags = (way.tags ?? {}) as Record<string, unknown>;
      // Kart tracks next to a circuit would only clutter its outline.
      if (tags.sport === "karting" || /kart/i.test(String(tags.name ?? "")))
        continue;
      const line = list(way.geometry).map((point): LatLon => {
        const { lat, lon } = record(point);
        if (typeof lat !== "number" || typeof lon !== "number")
          throw new TypeError();
        return [Number(lat.toFixed(5)), Number(lon.toFixed(5))];
      });
      if (line.length < 2) continue;
      points += line.length;
      if (points > MAX_POINTS) break;
      lines.push(line);
    }
    return lines;
  });
}

export const isLines = (value: unknown): value is LatLon[][] =>
  Array.isArray(value) &&
  value.every(
    (line) =>
      Array.isArray(line) &&
      line.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number",
      ),
  );
