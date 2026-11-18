// Track local time. Every time in the app is kept as epoch milliseconds; a
// track's IANA time zone only decides how it is shown and what "14:00" means.

import type { Track } from "./types.ts";

const DAY = 86_400_000;

/** True for a time zone name this computer knows, like "Europe/Brussels". */
export function isZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone === "") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A track's time zone; UTC until it is known. */
export function trackZone(track: Pick<Track, "timezone">): string {
  return isZone(track.timezone) ? track.timezone : "UTC";
}

const partFormats = new Map<string, Intl.DateTimeFormat>();

function parts(time: number, zone: string) {
  let format = partFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormats.set(zone, format);
  }
  const values: Record<string, number> = {};
  for (const part of format.formatToParts(time))
    if (part.type !== "literal") values[part.type] = Number(part.value);
  return values;
}

/** How far a zone's clock is ahead of UTC at a moment, in milliseconds. */
export function zoneOffset(time: number, zone: string): number {
  if (zone === "UTC") return 0;
  const p = parts(time, zone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(time / 1000) * 1000;
}

/** The calendar day at a moment in a zone, as "2026-11-20". */
export function localDay(time: number, zone: string): string {
  return new Date(time + zoneOffset(time, zone)).toISOString().slice(0, 10);
}

/** "2026-11-20" plus a number of days, as a day again. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * The moment a zone's clock shows a day and a time of day (in minutes). On the
 * night clocks go forward, a time that does not exist gives the hour after it.
 */
export function zonedTime(day: string, minutes: number, zone: string): number {
  const wall = Date.parse(day + "T00:00:00Z") + minutes * 60_000;
  // The offset at the answer is what counts; two passes settle on it.
  let time = wall - zoneOffset(wall, zone);
  time = wall - zoneOffset(time, zone);
  return time;
}

/** Midnight, in the zone, of the day a moment falls in. */
export function localMidnight(time: number, zone: string): number {
  return zonedTime(localDay(time, zone), 0, zone);
}

/** "CET", "BST" or "GMT+9": the zone's short name at a moment. */
export function zoneName(time: number, zone: string): string {
  if (zone === "UTC") return "UTC";
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "short",
  })
    .formatToParts(time)
    .find((part) => part.type === "timeZoneName")?.value;
  return name ?? zone;
}
