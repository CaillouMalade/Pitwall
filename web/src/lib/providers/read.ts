// Small readers shared by the adapters: they turn a missing or mistyped field
// into one format error, and stop an unusable location before any request.

import { ServiceError } from "../http.ts";

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
}

/** Stop an unusable location before any request is sent. */
export function validateLocation(location: {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}): void {
  const { name, latitude, longitude } = location;
  if (typeof name !== "string" || name.trim() === "")
    throw new ServiceError("input", "The location has no name.");
  if (typeof latitude !== "number" || typeof longitude !== "number")
    throw new ServiceError("input", `${name} has invalid coordinates.`);
  // Written as "not inside" so NaN is rejected too: every comparison with NaN is false.
  if (
    !(latitude >= -90 && latitude <= 90) ||
    !(longitude >= -180 && longitude <= 180)
  )
    throw new ServiceError(
      "input",
      `${name} has coordinates outside the valid range.`,
    );
}

export class FormatError extends Error {}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new FormatError();
  return value as Record<string, unknown>;
}

export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new FormatError();
  return value;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new FormatError();
  return value;
}

export function time(value: unknown, assumeUtc = false): number {
  if (typeof value !== "string") throw new FormatError();
  const text =
    assumeUtc && !/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value + "Z" : value;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) throw new FormatError();
  return parsed;
}

export function readOrFail<T>(message: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof FormatError || error instanceof TypeError)
      throw new ServiceError("format", message);
    throw error;
  }
}

export const formatMessage = (label: string) =>
  `${label} sent a forecast in an unexpected format.`;

/** Round to 4 decimals: about 11 m, and the most several services accept. */
export function fourDecimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** True inside a latitude/longitude box given as [south, west, north, east]. */
export function insideBox(
  location: { latitude: number; longitude: number },
  [south, west, north, east]: readonly [number, number, number, number],
): boolean {
  return (
    location.latitude >= south &&
    location.latitude <= north &&
    location.longitude >= west &&
    location.longitude <= east
  );
}
