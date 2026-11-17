// Checks for a track a user adds or edits: its name and coordinates.

import type { Track } from "./types.ts";

export const MAX_TRACK_NAME_LENGTH = 60;

/** A check that failed, with a message to show next to the form. */
export class TrackInputError extends Error {
  readonly field: "name" | "latitude" | "longitude";
  constructor(field: TrackInputError["field"], message: string) {
    super(message);
    this.name = "TrackInputError";
    this.field = field;
  }
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
  // A decimal comma is how most of Europe writes it.
  const trimmed = text.trim().replace(/^([+-]?\d*),(\d+)$/, "$1.$2");
  // "nan" and "inf" are numbers to some readers; here they fail the range check.
  const value = NUMBER.test(trimmed)
    ? Number(trimmed)
    : /^[+-]?(nan|inf|infinity)$/i.test(trimmed)
      ? Number.NaN
      : null;
  if (value === null)
    throw new TrackInputError(
      field,
      `${label} must be a number, for example ${field === "latitude" ? "50.43" : "5.97"}.`,
    );
  if (!(value >= low && value <= high))
    throw new TrackInputError(
      field,
      `${label} must be between ${low} and ${high}.`,
    );
  return value;
}

/** "Circuit de Nevers" gives "circuit-de-nevers"; a name with no letters gives "track". */
export function trackSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "track"
  );
}

/** An id no other track has: the slug, then "slug-2", "slug-3"… */
export function newTrackId(name: string, tracks: readonly Track[]): string {
  const taken = new Set(tracks.map((track) => track.id));
  const slug = trackSlug(name);
  if (!taken.has(slug)) return slug;
  for (let number = 2; ; number++)
    if (!taken.has(`${slug}-${number}`)) return `${slug}-${number}`;
}

export interface TrackInput {
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Check a track's name and coordinates. `tracks` is every track already in the
 * app, for the name check; `editingId` is the track being edited, which may
 * keep its own name.
 */
export function checkTrack(
  name: string,
  latitudeText: string,
  longitudeText: string,
  tracks: readonly Track[],
  editingId?: string,
): TrackInput {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw new TrackInputError("name", "Please enter a name for the track.");
  if (trimmed.length > MAX_TRACK_NAME_LENGTH)
    throw new TrackInputError(
      "name",
      `A track name has at most ${MAX_TRACK_NAME_LENGTH} characters.`,
    );
  // Case does not count: "monza" and "Monza" are the same name.
  const taken = tracks.find(
    (track) =>
      track.id !== editingId &&
      track.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (taken)
    throw new TrackInputError(
      "name",
      `A track called ${taken.name} is already in the list.`,
    );
  const latitude = readCoordinate(latitudeText, "latitude", -90, 90);
  const longitude = readCoordinate(longitudeText, "longitude", -180, 180);
  return { name: trimmed, latitude, longitude };
}

/** A new track from checked input, with an id of its own. */
export function createTrack(
  input: TrackInput,
  tracks: readonly Track[],
): Track {
  return { id: newTrackId(input.name, tracks), country: "", ...input };
}

/** "45.6191° N, 9.2822° E" */
export function formatCoordinates(track: {
  latitude: number;
  longitude: number;
}): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
  return `${part(track.latitude, "N", "S")}, ${part(track.longitude, "E", "W")}`;
}
