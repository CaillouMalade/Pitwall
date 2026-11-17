// Every time in the app is shown in UTC, like the sessions.

import {
  temperatureLabel,
  toTemperature,
  toTemperatureDifference,
  toWind,
  windDigits,
  windLabel,
  type Units,
} from "./units.ts";

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

/** A number with fixed decimals, without "-0.0" for values that round to zero. */
export function formatNumber(value: number, digits = 1): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

export function formatValue(
  value: number | null,
  unit: string,
  digits = 1,
): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${formatNumber(value, digits)} ${unit}`;
}

/** Converting and formatting in the units the user chose. */
export interface UnitFormat {
  units: Units;
  temperatureUnit: string;
  windUnit: string;
  windDigits: number;
  /** A value in °C, converted. */
  toTemperature(celsius: number): number;
  toTemperatureDifference(celsius: number): number;
  /** A value in m/s, converted. */
  toWind(metresPerSecond: number): number;
  /** "7.5 °C" from °C. */
  temperature(celsius: number | null): string;
  /** "4.2 °C" from a difference in °C. */
  temperatureDifference(celsius: number | null): string;
  /** "26 km/h" from m/s. */
  wind(metresPerSecond: number | null): string;
  /** "7.5" from °C, without the unit. */
  temperatureNumber(celsius: number): string;
  /** "26" from m/s, without the unit. */
  windNumber(metresPerSecond: number): string;
}

export function unitFormat(units: Units): UnitFormat {
  const temperatureUnit = temperatureLabel(units.temperature);
  const windUnit = windLabel(units.wind);
  const digits = windDigits(units.wind);
  const convertTemperature = (value: number) =>
    toTemperature(value, units.temperature);
  const convertDifference = (value: number) =>
    toTemperatureDifference(value, units.temperature);
  const convertWind = (value: number) => toWind(value, units.wind);
  return {
    units,
    temperatureUnit,
    windUnit,
    windDigits: digits,
    toTemperature: convertTemperature,
    toTemperatureDifference: convertDifference,
    toWind: convertWind,
    temperature: (value) =>
      formatValue(
        value === null ? null : convertTemperature(value),
        temperatureUnit,
      ),
    temperatureDifference: (value) =>
      formatValue(
        value === null ? null : convertDifference(value),
        temperatureUnit,
      ),
    wind: (value) =>
      formatValue(value === null ? null : convertWind(value), windUnit, digits),
    temperatureNumber: (value) => formatNumber(convertTemperature(value)),
    windNumber: (value) => formatNumber(convertWind(value), digits),
  };
}

/**
 * Round, evenly spaced axis ticks that hold low and high: steps of 1, 2, 2.5 or
 * 5 times a power of ten, about `count` of them.
 */
export function niceTicks(low: number, high: number, count = 4): number[] {
  if (!(high > low)) return [low];
  const rough = (high - low) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].find((factor) => factor * power >= rough)! * power;
  const first = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick < high + step - step * 1e-9; tick += step)
    ticks.push(Number(tick.toFixed(10)));
  return ticks;
}
