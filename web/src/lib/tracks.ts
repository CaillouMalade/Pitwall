// Checks for a track a user adds: name, coordinates and distance to a Grade 1 circuit.

import type { Track } from "./types.ts";

const EARTH_RADIUS_KM = 6371;
export const MAX_DISTANCE_KM = 3;
export const NOT_FOUND_MESSAGE = "No racetrack found at these coordinates.";

/** A check that failed, with a message to show next to the form. */
export class TrackInputError extends Error {
  readonly field: "name" | "latitude" | "longitude" | "location";
  constructor(field: TrackInputError["field"], message: string) {
    super(message);
    this.name = "TrackInputError";
    this.field = field;
  }
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance in km between two points on the Earth, with the haversine formula. */
export function distanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const deltaLat = radians(latitude2 - latitude1);
  const deltaLon = radians(longitude2 - longitude1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(latitude1)) *
      Math.cos(radians(latitude2)) *
      Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** The closest track and its distance in km, or null for an empty list. */
export function nearestTrack(
  latitude: number,
  longitude: number,
  tracks: readonly Track[],
): { track: Track; distance: number } | null {
  let best: { track: Track; distance: number } | null = null;
  for (const track of tracks) {
    const distance = distanceKm(
      latitude,
      longitude,
      track.latitude,
      track.longitude,
    );
    if (best === null || distance < best.distance) best = { track, distance };
  }
  return best;
}

/** Strict decimal number: "45.6", "-8", ".5", "1e2"; not "", "north" or "12abc". */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function readCoordinate(
  text: string,
  field: "latitude" | "longitude",
  low: number,
  high: number,
): number {
  const label = field === "latitude" ? "Latitude" : "Longitude";
  const trimmed = text.trim();
  // "nan" and "inf" read as numbers in the Python app and then fail the range check.
  const value = NUMBER.test(trimmed)
    ? Number(trimmed)
    : /^[+-]?(nan|inf|infinity)$/i.test(trimmed)
      ? Number.NaN
      : null;
  if (value === null)
    throw new TrackInputError(
      field,
      `${label} must be a number, for example 50.43.`,
    );
  if (!(value >= low && value <= high))
    throw new TrackInputError(
      field,
      `${label} must be between ${low} and ${high}.`,
    );
  return value;
}

export function trackId(name: string): string {
  return name.trim().toLowerCase().replace(/ /g, "-");
}

/**
 * Check a new track before saving it. `tracks` is every track already in the app
 * (for the name check), `grade1` the circuits a new track must be close to.
 */
export function checkNewTrack(
  name: string,
  latitudeText: string,
  longitudeText: string,
  tracks: readonly Track[],
  grade1: readonly Track[],
): Track {
  const trimmed = name.trim();
  if (trimmed === "")
    throw new TrackInputError("name", "Please enter a name for the track.");
  // Case does not count: "monza" and "Monza" are the same name.
  const taken = tracks.find(
    (track) => track.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (taken)
    throw new TrackInputError(
      "name",
      `A track called ${taken.name} is already in the list.`,
    );
  const id = trackId(trimmed);
  if (tracks.some((track) => track.id === id))
    throw new TrackInputError(
      "name",
      `A track with a similar name is already in the list.`,
    );

  const latitude = readCoordinate(latitudeText, "latitude", -90, 90);
  const longitude = readCoordinate(longitudeText, "longitude", -180, 180);

  // Only once every input is valid: a Grade 1 circuit must be within 3 km.
  const nearest = nearestTrack(latitude, longitude, grade1);
  if (nearest === null || nearest.distance > MAX_DISTANCE_KM)
    throw new TrackInputError("location", NOT_FOUND_MESSAGE);

  return {
    id,
    name: trimmed,
    country: nearest.track.country,
    latitude,
    longitude,
  };
}
