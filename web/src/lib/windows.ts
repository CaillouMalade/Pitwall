// The 3-hour UTC windows (00, 03, ... 21) every forecast provider is cut into.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WINDOW_HOURS = 3;
export const WINDOW = WINDOW_HOURS * HOUR;
export const FORECAST_DAYS = 5;

/** True for 00:00, 03:00, ... 21:00 UTC. */
export function isWindowStart(time: number): boolean {
  return time % WINDOW === 0;
}

/** The start of the 3-hour window a time falls in (14:20 gives 12:00). */
export function windowStart(time: number): number {
  return Math.floor(time / WINDOW) * WINDOW;
}

/** The rain of the hours in one window, or null if any hour is missing. */
export function sumRain(
  amounts: readonly (number | null | undefined)[],
): number | null {
  // A partial sum would look like a real (too low) value, so we don't make one.
  let total = 0;
  for (const amount of amounts) {
    if (amount === null || amount === undefined) return null;
    total += amount;
  }
  return total;
}

/** Keep the points from the current window up to 5 days ahead. */
export function keepNextFiveDays<T extends { time: number }>(
  points: T[],
  now: number,
): T[] {
  const first = windowStart(now);
  const last = first + FORECAST_DAYS * DAY;
  return points.filter((point) => point.time >= first && point.time < last);
}
