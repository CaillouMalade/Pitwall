// Past weather as CSV, to line up with a team's own data from a weekend.

import type { UnitFormat } from "./format.ts";
import type { DailyWeather, HourlyWeather } from "./history.ts";
import { zoneOffset } from "./zone.ts";

/** A cell, quoted when it needs it. A leading =, +, - or @ is kept from running as a formula. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvText(
  rows: readonly (readonly (string | number | null)[])[],
): string {
  // The byte order mark makes Excel read the accents in track names.
  return (
    "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}

const round = (value: number | null, digits: number) =>
  value === null ? null : Number(value.toFixed(digits));

/** "2026-11-20T14:00:00+01:00": the local time with its offset. */
export function localStamp(time: number, zone: string): string {
  const offset = zoneOffset(time, zone);
  const sign = offset < 0 ? "-" : "+";
  const minutes = Math.abs(offset) / 60_000;
  const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");
  return (
    new Date(time + offset).toISOString().slice(0, 19) +
    `${sign}${pad(minutes / 60)}:${pad(minutes % 60)}`
  );
}

const unitName = (format: UnitFormat) => ({
  temperature: format.units.temperature === "f" ? "f" : "c",
  wind:
    format.units.wind === "mph"
      ? "mph"
      : format.units.wind === "ms"
        ? "ms"
        : "kmh",
});

export interface TrackHours {
  track: string;
  zone: string;
  hours: readonly HourlyWeather[];
}

/** One row per track and hour, in the chosen units. */
export function hourlyCsv(
  tracks: readonly TrackHours[],
  format: UnitFormat,
): string {
  const unit = unitName(format);
  const rows: (string | number | null)[][] = [
    [
      "track",
      "hour_start_utc",
      "hour_start_local",
      `temperature_${unit.temperature}`,
      "rain_mm",
      `wind_${unit.wind}`,
      "wind_from_deg",
      `gust_${unit.wind}`,
    ],
  ];
  for (const { track, zone, hours } of tracks)
    for (const hour of hours)
      rows.push([
        track,
        new Date(hour.time).toISOString().slice(0, 19) + "Z",
        localStamp(hour.time, zone),
        round(
          hour.temperature === null
            ? null
            : format.toTemperature(hour.temperature),
          1,
        ),
        round(hour.rain, 2),
        round(
          hour.windSpeed === null ? null : format.toWind(hour.windSpeed),
          1,
        ),
        round(hour.windDeg, 0),
        round(hour.gust === null ? null : format.toWind(hour.gust), 1),
      ]);
  return csvText(rows);
}

export interface TrackDays {
  track: string;
  days: readonly DailyWeather[];
}

/** One row per track and day, in the chosen units. */
export function dailyCsv(
  tracks: readonly TrackDays[],
  format: UnitFormat,
): string {
  const unit = unitName(format);
  const convert = (value: number | null, to: (value: number) => number) =>
    round(value === null ? null : to(value), 1);
  const rows: (string | number | null)[][] = [
    [
      "track",
      "day_local",
      `temperature_min_${unit.temperature}`,
      `temperature_mean_${unit.temperature}`,
      `temperature_max_${unit.temperature}`,
      "rain_mm",
      `wind_max_${unit.wind}`,
      `gust_max_${unit.wind}`,
      "wind_from_deg",
    ],
  ];
  for (const { track, days } of tracks)
    for (const day of days)
      rows.push([
        track,
        day.day,
        convert(day.temperatureMin, format.toTemperature),
        convert(day.temperatureMean, format.toTemperature),
        convert(day.temperatureMax, format.toTemperature),
        round(day.rain, 2),
        convert(day.windMax, format.toWind),
        convert(day.gustMax, format.toWind),
        round(day.windFrom, 0),
      ]);
  return csvText(rows);
}

/** "pitwall-spa-2026-11-01-to-2026-11-03-hourly.csv" */
export function csvName(
  what: string,
  start: string,
  end: string,
  kind: "hourly" | "daily",
): string {
  const slug =
    what
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tracks";
  return `pitwall-${slug}-${start}-to-${end}-${kind}.csv`;
}

/** Hand a text to the browser as a file to save. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
