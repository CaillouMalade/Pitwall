// Past weather by the hour, the same dates over the years, and the CSV export.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csvCell,
  csvName,
  csvText,
  dailyCsv,
  hourlyCsv,
  localStamp,
} from "../web/src/lib/csv.ts";
import { unitFormat } from "../web/src/lib/format.ts";
import {
  fetchDays,
  fetchHours,
  fetchSameDates,
} from "../web/src/lib/history-source.ts";
import {
  climate,
  hoursToDays,
  type DailyWeather,
  type HourlyWeather,
} from "../web/src/lib/history.ts";
import { localDay } from "../web/src/lib/zone.ts";
import { fakeFetch, json, status, utc } from "./helpers.ts";

const SPA = { name: "Spa", latitude: 50.4372, longitude: 5.9714 };
const HOUR = 3_600_000;
const metric = unitFormat({ temperature: "c", wind: "kmh" });
const imperial = unitFormat({ temperature: "f", wind: "mph" });

// Hours

/** 72 hours from 19 November 00:00 UTC, as the archive sends them. */
function hourlyAnswer() {
  const first = utc(2026, 11, 19);
  const time = Array.from({ length: 72 }, (_, i) =>
    new Date(first + i * HOUR).toISOString().slice(0, 16),
  );
  return {
    hourly: {
      time,
      temperature_2m: time.map((_, i) => i),
      precipitation: time.map((_, i) => (i === 30 ? 2.5 : 0)),
      wind_speed_10m: time.map(() => 4),
      wind_direction_10m: time.map(() => 270),
      wind_gusts_10m: time.map((_, i) => (i === 71 ? null : 9)),
    },
  };
}

test("hours are asked a day wider in UTC, then cut to the track's days", async () => {
  const fetch = fakeFetch(json(hourlyAnswer()));
  const hours = await fetchHours(
    SPA,
    "2026-11-20",
    "2026-11-20",
    "Europe/Brussels",
    fetch,
  );
  const { searchParams } = new globalThis.URL(fetch.calls[0].url);
  assert.equal(searchParams.get("start_date"), "2026-11-19");
  assert.equal(searchParams.get("end_date"), "2026-11-21");
  assert.equal(searchParams.get("timezone"), "UTC");
  assert.equal(searchParams.get("wind_speed_unit"), "ms");
  // 20 November in Brussels is 19 Nov 23:00 to 20 Nov 23:00 UTC.
  assert.equal(hours.length, 24);
  assert.equal(hours[0].time, utc(2026, 11, 19, 23));
  assert.equal(hours.at(-1)!.time, utc(2026, 11, 20, 22));
  // The archive's value at 00:00 covers the hour before: it is the hour from 23:00.
  assert.equal(hours[0].temperature, 24);
  // 2.5 mm stamped 06:00 fell from 05:00 to 06:00 UTC.
  const wet = hours.find((hour) => hour.rain === 2.5)!;
  assert.equal(wet.time, utc(2026, 11, 20, 5));
  assert.deepEqual([wet.windSpeed, wet.windDeg, wet.gust], [4, 270, 9]);
});

test("hours that cannot be read, or a bad place", async () => {
  await assert.rejects(
    fetchHours(
      SPA,
      "2026-11-20",
      "2026-11-20",
      "UTC",
      fakeFetch(json({ hourly: 3 })),
    ),
    { message: "The weather archive sent an answer in an unexpected format." },
  );
  await assert.rejects(
    fetchHours(SPA, "2026-11-20", "2026-11-20", "UTC", fakeFetch(status(429))),
    /Too many requests/,
  );
  const fetch = fakeFetch(json(hourlyAnswer()));
  await assert.rejects(
    fetchHours(
      { name: "X", latitude: 95, longitude: 0 },
      "2026-11-20",
      "2026-11-20",
      "UTC",
      fetch,
    ),
    /outside the valid range/,
  );
  assert.equal(fetch.calls.length, 0);
});

test("hours become days on the track's calendar", () => {
  const hours: HourlyWeather[] = [
    // 22:00 and 23:00 UTC on the 19th: the second is already the 20th in Brussels.
    {
      time: utc(2026, 11, 19, 22),
      temperature: 4,
      rain: 1,
      windSpeed: 3,
      windDeg: 200,
      gust: 8,
    },
    {
      time: utc(2026, 11, 19, 23),
      temperature: 6,
      rain: 0.5,
      windSpeed: 5,
      windDeg: 210,
      gust: 11,
    },
    {
      time: utc(2026, 11, 20, 0),
      temperature: 2,
      rain: null,
      windSpeed: 7,
      windDeg: 220,
      gust: null,
    },
  ];
  const days = hoursToDays(hours, (time) => localDay(time, "Europe/Brussels"));
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-11-19", "2026-11-20"],
  );
  assert.deepEqual(days[1], {
    day: "2026-11-20",
    temperatureMin: 2,
    temperatureMax: 6,
    temperatureMean: 4,
    rain: 0.5,
    temperatureRange: 4,
    windMax: 7,
    gustMax: 11,
    windFrom: null,
  });
});

// Days, and the same dates over the years

const day = (
  date: string,
  rain: number | null,
  high: number | null = 10,
  wind: number | null = 5,
): DailyWeather => ({
  day: date,
  temperatureMin: high === null ? null : high - 6,
  temperatureMax: high,
  temperatureMean: high === null ? null : high - 3,
  rain,
  temperatureRange: high === null ? null : 6,
  windMax: wind,
  gustMax: null,
  windFrom: null,
});

const dailyAnswer = (dates: string[], rain: (number | null)[]) => ({
  daily: {
    time: dates,
    temperature_2m_max: dates.map(() => 10),
    temperature_2m_min: dates.map(() => 4),
    temperature_2m_mean: dates.map(() => 7),
    precipitation_sum: rain,
    wind_speed_10m_max: dates.map(() => 5),
    wind_gusts_10m_max: dates.map(() => 12),
    wind_direction_10m_dominant: dates.map(() => 240),
  },
});

test("days are asked on the track's calendar, with gusts and direction", async () => {
  const fetch = fakeFetch(
    json(dailyAnswer(["2026-11-19", "2026-11-20"], [1.5, 0])),
  );
  const days = await fetchDays(
    SPA,
    "2026-11-19",
    "2026-11-20",
    "Europe/Brussels",
    fetch,
  );
  const { searchParams } = new globalThis.URL(fetch.calls[0].url);
  assert.equal(searchParams.get("timezone"), "Europe/Brussels");
  assert.equal(searchParams.get("start_date"), "2026-11-19");
  assert.equal(days[0].gustMax, 12);
  assert.equal(days[0].windFrom, 240);
  assert.equal(days[0].rain, 1.5);
});

test("the same dates in earlier years: one small request per year", async () => {
  const fetch = fakeFetch((address) => {
    const { searchParams } = new globalThis.URL(address);
    const start = searchParams.get("start_date")!;
    // 2023 fails: it is left out, the others still count.
    if (start.startsWith("2023")) return status(500);
    const end = searchParams.get("end_date")!;
    return json(
      dailyAnswer([start, end], [start.startsWith("2024") ? 3 : 0, 0]),
    );
  });
  const years = await fetchSameDates(
    SPA,
    "11-19",
    2,
    [2022, 2023, 2024, 2025],
    "Europe/Brussels",
    fetch,
  );
  assert.equal(fetch.calls.length, 4);
  assert.deepEqual(
    years.map((item) => item.year),
    [2022, 2024, 2025],
  );
  assert.deepEqual(
    years[1].days.map((item) => item.day),
    ["2024-11-19", "2024-11-20"],
  );
  assert.equal(years[1].days[0].rain, 3);
});

test("29 February in a year without one, and a total failure", async () => {
  const fetch = fakeFetch((address) => {
    const { searchParams } = new globalThis.URL(address);
    return json(dailyAnswer([searchParams.get("start_date")!], [0]));
  });
  const years = await fetchSameDates(
    SPA,
    "02-29",
    1,
    [2023, 2024],
    "UTC",
    fetch,
  );
  assert.deepEqual(
    years.map((item) => item.days[0].day),
    ["2023-03-01", "2024-02-29"],
  );
  await assert.rejects(
    fetchSameDates(
      SPA,
      "11-19",
      2,
      [2024, 2025],
      "UTC",
      fakeFetch(status(429)),
    ),
    /Too many requests/,
  );
});

test("what is normal for the dates", () => {
  const normal = climate([
    {
      year: 2023,
      days: [day("2023-11-20", 0, 8, 4), day("2023-11-21", 0, 9, 5)],
    },
    {
      year: 2024,
      days: [day("2024-11-20", 12, 10, 9), day("2024-11-21", 0.4, 11, 6)],
    },
    {
      year: 2025,
      days: [day("2025-11-20", 2, 12, 7), day("2025-11-21", null, null, null)],
    },
  ]);
  assert.equal(normal.days, 6);
  assert.equal(normal.years, 3);
  // 2 of the 5 days with a rain value reached 1 mm.
  assert.equal(normal.rainShare, 0.4);
  // 2 of the 3 weekends had such a day.
  assert.ok(Math.abs(normal.wetYearShare! - 2 / 3) < 1e-9);
  // Highs 8, 9, 10, 11, 12: the middle, and the 10th and 90th percentile.
  assert.deepEqual(
    normal.high!.map((value) => Number(value.toFixed(2))),
    [8.4, 10, 11.6],
  );
  assert.equal(normal.low![1], 4);
  assert.equal(normal.wind![1], 6);
  assert.deepEqual(normal.wettest, { day: "2024-11-20", rain: 12 });
});

test("nothing known is not zero", () => {
  const nothing = climate([]);
  assert.equal(nothing.rainShare, null);
  assert.equal(nothing.wetYearShare, null);
  assert.equal(nothing.high, null);
  assert.equal(nothing.wettest, null);
});

// CSV

test("cells are quoted when needed, and never start a formula", () => {
  assert.equal(csvCell("Spa"), "Spa");
  assert.equal(csvCell('Circuit "A", north'), '"Circuit ""A"", north"');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-3 below"), "'-3 below");
  assert.equal(csvCell("@home"), "'@home");
  assert.equal(csvCell(-3.5), "-3.5");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(Number.NaN), "");
  assert.equal(
    csvText([
      ["a", 1],
      ["b", null],
    ]),
    "﻿a,1\r\nb,\r\n",
  );
});

test("local time with its offset", () => {
  assert.equal(
    localStamp(utc(2026, 11, 20, 13), "Europe/Brussels"),
    "2026-11-20T14:00:00+01:00",
  );
  assert.equal(
    localStamp(utc(2026, 7, 20, 13), "America/New_York"),
    "2026-07-20T09:00:00-04:00",
  );
  assert.equal(
    localStamp(utc(2026, 7, 20, 13), "Asia/Kolkata"),
    "2026-07-20T18:30:00+05:30",
  );
  assert.equal(
    localStamp(utc(2026, 7, 20, 13), "UTC"),
    "2026-07-20T13:00:00+00:00",
  );
});

const HOURS: HourlyWeather[] = [
  {
    time: utc(2026, 11, 20, 13),
    temperature: 10.04,
    rain: 0.25,
    windSpeed: 5,
    windDeg: 247.6,
    gust: 10,
  },
  {
    time: utc(2026, 11, 20, 14),
    temperature: null,
    rain: null,
    windSpeed: null,
    windDeg: null,
    gust: null,
  },
];

test("hourly CSV: one row per track and hour, in the chosen units", () => {
  const text = hourlyCsv(
    [
      { track: "Spa-Francorchamps", zone: "Europe/Brussels", hours: HOURS },
      { track: "Circuit, Other", zone: "UTC", hours: HOURS.slice(0, 1) },
    ],
    metric,
  );
  assert.deepEqual(text.replace("﻿", "").trim().split("\r\n"), [
    "track,hour_start_utc,hour_start_local,temperature_c,rain_mm,wind_kmh,wind_from_deg,gust_kmh",
    "Spa-Francorchamps,2026-11-20T13:00:00Z,2026-11-20T14:00:00+01:00,10,0.25,18,248,36",
    // A missing value is an empty cell, not 0.
    "Spa-Francorchamps,2026-11-20T14:00:00Z,2026-11-20T15:00:00+01:00,,,,,",
    '"Circuit, Other",2026-11-20T13:00:00Z,2026-11-20T13:00:00+00:00,10,0.25,18,248,36',
  ]);
  const [header, row] = hourlyCsv(
    [{ track: "Spa", zone: "UTC", hours: HOURS.slice(0, 1) }],
    imperial,
  )
    .replace("﻿", "")
    .trim()
    .split("\r\n");
  assert.match(
    header,
    /temperature_f,rain_mm,wind_mph,wind_from_deg,gust_mph$/,
  );
  // 10.04 °C is 50.1 °F; 5 m/s is 11.2 mph.
  assert.match(row, /,50\.1,0\.25,11\.2,248,22\.4$/);
});

test("daily CSV and file names", () => {
  const text = dailyCsv(
    [{ track: "Spa", days: [day("2026-11-20", 2.345, 10, 5)] }],
    metric,
  );
  assert.deepEqual(text.replace("﻿", "").trim().split("\r\n"), [
    "track,day_local,temperature_min_c,temperature_mean_c,temperature_max_c,rain_mm,wind_max_kmh,gust_max_kmh,wind_from_deg",
    "Spa,2026-11-20,4,7,10,2.35,18,,",
  ]);
  assert.equal(
    csvName("Nürburgring GP", "2026-11-19", "2026-11-21", "hourly"),
    "pitwall-nurburgring-gp-2026-11-19-to-2026-11-21-hourly.csv",
  );
  assert.equal(
    csvName("???", "a", "b", "daily"),
    "pitwall-tracks-a-to-b-daily.csv",
  );
});
