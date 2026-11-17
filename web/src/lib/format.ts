// Every time in the app is shown in UTC, like the sessions.

const make = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options });

const dayTime = make({
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayOnly = make({ weekday: "short", day: "numeric", month: "short" });
const shortDay = make({ day: "numeric", month: "short" });
const clock = make({ hour: "2-digit", minute: "2-digit" });

/** "Tue 18 Nov, 08:00" */
export const formatDayTime = (time: number) => dayTime.format(time);
/** "Tue 18 Nov" */
export const formatDay = (time: number) => dayOnly.format(time);
/** "18 Nov", for chart axes. */
export const formatShortDay = (time: number) => shortDay.format(time);
/** "08:00" */
export const formatClock = (time: number) => clock.format(time);

/** A "2026-11-01" day as "1 Nov". */
export const formatIsoDay = (day: string) =>
  shortDay.format(Date.parse(day + "T00:00:00Z"));

export function formatValue(
  value: number | null,
  unit: string,
  digits = 1,
): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const text = value.toFixed(digits);
  return `${Number(text) === 0 ? (0).toFixed(digits) : text} ${unit}`;
}
