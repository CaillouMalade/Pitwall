// The race weekend: fixed session times in UTC, the same for every track.
// The weekend is always the next three days, starting tomorrow.

import { DAY, HOUR } from "./windows.ts";

export type SessionName = "FP1" | "FP2" | "FP3" | "Qualifying" | "Race";

/** Session, day of the weekend counted from 0, hour in UTC. */
export const SESSIONS: readonly [SessionName, number, number][] = [
  ["FP1", 0, 8],
  ["FP2", 0, 14],
  ["FP3", 1, 8],
  ["Qualifying", 1, 14],
  ["Race", 2, 13],
];

export const WEEKEND_DAYS = 3;

export interface Session {
  name: SessionName;
  start: number;
}

/** The first day of the race weekend: tomorrow at 00:00 UTC. */
export function weekendStart(now: number = Date.now()): number {
  return Math.floor(now / DAY) * DAY + DAY;
}

export function sessionTimes(now: number = Date.now()): Session[] {
  const first = weekendStart(now);
  return SESSIONS.map(([name, day, hour]) => ({
    name,
    start: first + day * DAY + hour * HOUR,
  }));
}
