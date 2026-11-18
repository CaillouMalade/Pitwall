// A whole session as one answer, the rain map of a session, and the circuit's shape.

import assert from "node:assert/strict";
import { test } from "node:test";
import outlines from "../web/src/data/track-outlines.json" with { type: "json" };
import { GRADE1_TRACKS } from "../web/src/data/grade1-tracks.ts";
import { fetchTrackLines, isLines } from "../web/src/lib/outline-source.ts";
import {
  bearing,
  fit,
  pathOf,
  resample,
  shapeOf,
  toMetres,
  turn,
  windOn,
  type Outline,
} from "../web/src/lib/outline.ts";
import { radarFrames } from "../web/src/lib/providers/index.ts";
import {
  centreSeries,
  fetchRainGrid,
  fetchZone,
  frameAt,
  GRID_SIZE,
  gridPoints,
  interpolateFrame,
  QUARTER,
  rainColour,
} from "../web/src/lib/rain-map.ts";
import {
  combinePeriod,
  combineWindow,
  confidence,
  hoursOf,
  periodPoints,
} from "../web/src/lib/stats.ts";
import type { ForecastPoint } from "../web/src/lib/types.ts";
import { fakeFetch, json, status, utc } from "./helpers.ts";

const HOUR = 3_600_000;
const SPA = { name: "Spa", latitude: 50.4372, longitude: 5.9714 };

// A session as one answer

const START = utc(2026, 11, 20, 13);

/** One source's hours from 13:00: [temperature, wind, direction, rain]. */
function source(
  id: string,
  hours: [number | null, number | null, number | null, number | null][],
): ForecastPoint[] {
  return hours.map(([temperature, windSpeed, windDeg, rain], i) => ({
    source: id,
    time: START + i * HOUR,
    temperature,
    windSpeed,
    windDeg,
    rain,
  }));
}

const RACE = [
  ...source("ecmwf-ifs", [
    [10, 4, 350, 0],
    [12, 6, 10, 0.6],
    [14, 8, 0, 0],
  ]),
  ...source("noaa-gfs", [
    [11, 5, 90, 0.1],
    [11, 5, 90, 0.1],
    [11, 5, 90, 0.1],
  ]),
  ...source("ukmo", [
    [9, 3, 180, 0],
    [9, 3, 180, null],
    [9, 3, 180, 0],
  ]),
];

test("the hours a session touches", () => {
  assert.deepEqual(hoursOf(START, START + 2 * HOUR), [START, START + HOUR]);
  // 13:30 to 15:00 touches 13:00 and 14:00.
  assert.deepEqual(hoursOf(START + HOUR / 2, START + 2 * HOUR), [
    START,
    START + HOUR,
  ]);
  // 13:30 to 14:15 touches 14:00 too.
  assert.equal(hoursOf(START + HOUR / 2, START + 1.25 * HOUR).length, 2);
  // A session of no length still has its hour.
  assert.deepEqual(hoursOf(START, START), [START]);
});

test("each source's session: means, the rain total and the wettest hour", () => {
  const rows = periodPoints(RACE, START, START + 2 * HOUR);
  assert.deepEqual(
    rows.map((row) => row.source),
    ["ecmwf-ifs", "noaa-gfs", "ukmo"],
  );
  const [ecmwf, gfs, ukmo] = rows;
  assert.equal(ecmwf.temperature, 11);
  assert.equal(ecmwf.windSpeed, 5);
  // 350° and 10° average to north, not south.
  assert.ok(
    Math.abs(ecmwf.windDeg!) < 1e-6 || Math.abs(ecmwf.windDeg! - 360) < 1e-6,
  );
  assert.equal(ecmwf.rain, 0.6);
  assert.equal(ecmwf.peakRain, 0.6);
  assert.ok(Math.abs(gfs.rain! - 0.2) < 1e-9);
  assert.equal(gfs.peakRain, 0.1);
  // One of its two hours has no rain value: no total, as a partial sum would look too dry.
  assert.equal(ukmo.rain, null);
  assert.equal(ukmo.peakRain, 0);
  // The third hour is outside the session.
  assert.equal(periodPoints(RACE, START, START + 3 * HOUR)[0].temperature, 12);
});

test("a session combined: one vote per centre on its wettest hour", () => {
  const combined = combinePeriod(RACE, START, START + 2 * HOUR);
  assert.equal(combined.hours, 2);
  assert.equal(combined.sources, 3);
  assert.equal(combined.centres, 3);
  assert.equal(combined.temperature.value, 11);
  // GFS adds up to 0.2 mm, but no single hour of it is rain: 1 of 3.
  assert.equal(combined.rainVotes, 1);
  assert.equal(combined.rainVoters, 3);
  // Two totals, 0.6 and 0.2: their middle.
  assert.ok(Math.abs(combined.rain.value! - 0.4) < 1e-9);
  assert.equal(combined.rows.length, 3);
});

test("a session nobody forecasts", () => {
  const combined = combinePeriod(RACE, START + 24 * HOUR, START + 25 * HOUR);
  assert.equal(combined.sources, 0);
  assert.equal(combined.rainVoters, 0);
  assert.equal(combined.temperature.value, null);
  assert.equal(confidence(combined).overall, "unknown");
});

const centres = (values: Partial<ForecastPoint>[]) =>
  combineWindow(
    0,
    values.map((value, i) => ({
      // Each from its own centre.
      source: ["ecmwf-ifs", "noaa-gfs", "ukmo", "jma", "dwd-icon", "eccc-gem"][
        i
      ],
      time: 0,
      temperature: null,
      windSpeed: null,
      windDeg: null,
      rain: null,
      ...value,
    })),
  );

test("confidence follows how far the centres are apart", () => {
  const agree = centres([
    { temperature: 10, windSpeed: 4, rain: 0 },
    { temperature: 10.5, windSpeed: 4.5, rain: 0 },
    { temperature: 11, windSpeed: 5, rain: 0 },
    { temperature: 10.2, windSpeed: 4.2, rain: 0 },
  ]);
  assert.deepEqual(confidence(agree), {
    temperature: "high",
    rain: "high",
    wind: "high",
    overall: "high",
  });
  const split = centres([
    { temperature: 6, windSpeed: 2, rain: 0 },
    { temperature: 9, windSpeed: 5, rain: 2 },
    { temperature: 12, windSpeed: 9, rain: 0 },
    { temperature: 15, windSpeed: 12, rain: 3 },
  ]);
  assert.deepEqual(confidence(split), {
    temperature: "low",
    rain: "low",
    wind: "low",
    overall: "low",
  });
  // The worst of the three decides the overall grade.
  const rainOnly = centres([
    { temperature: 10, rain: 0 },
    { temperature: 10, rain: 1 },
    { temperature: 10, rain: 0 },
  ]);
  assert.equal(confidence(rainOnly).temperature, "high");
  assert.equal(confidence(rainOnly).rain, "medium");
  assert.equal(confidence(rainOnly).wind, "unknown");
  assert.equal(confidence(rainOnly).overall, "medium");
  // One centre is no agreement at all.
  assert.equal(
    confidence(centres([{ temperature: 10, rain: 0 }])).overall,
    "unknown",
  );
});

// The rain map

test("the grid is 7 by 7, 8 km apart, north-west first", () => {
  const points = gridPoints(SPA);
  assert.equal(points.length, GRID_SIZE * GRID_SIZE);
  const middle = points[24];
  assert.ok(Math.abs(middle.latitude - SPA.latitude) < 1e-9);
  assert.ok(Math.abs(middle.longitude - SPA.longitude) < 1e-9);
  assert.ok(points[0].latitude > middle.latitude);
  assert.ok(points[0].longitude < middle.longitude);
  // 24 km north is about 0.217° of latitude.
  assert.ok(
    Math.abs(points[0].latitude - middle.latitude - 24 / 110.57) < 1e-9,
  );
  // Further from the equator the same distance is more degrees of longitude.
  const north = gridPoints({ latitude: 65, longitude: 25 });
  assert.ok(
    north[48].longitude - north[0].longitude >
      points[48].longitude - points[0].longitude,
  );
  // Near a pole and the date line it stays on the map.
  for (const point of gridPoints({ latitude: 89.9, longitude: 179.9 })) {
    assert.ok(point.latitude <= 90 && point.latitude >= -90);
    assert.ok(point.longitude < 180 && point.longitude >= -180);
  }
});

function gridAnswer(
  steps: number,
  rain: (place: number, step: number) => number | null,
) {
  const first = utc(2026, 11, 20, 12);
  return Array.from({ length: 49 }, (_, place) => ({
    minutely_15: {
      time: Array.from({ length: steps }, (_, step) =>
        new Date(first + step * QUARTER).toISOString().slice(0, 16),
      ),
      precipitation: Array.from({ length: steps }, (_, step) =>
        rain(place, step),
      ),
    },
  }));
}

test("the rain grid is one request for 49 places in 15-minute steps", async () => {
  const fetch = fakeFetch(
    json(
      gridAnswer(5, (place, step) =>
        place === 24 ? step * 0.1 : place === 0 ? null : 0,
      ),
    ),
  );
  const grid = await fetchRainGrid(
    SPA,
    utc(2026, 11, 20, 12, 5),
    utc(2026, 11, 20, 12, 50),
    fetch,
  );
  assert.equal(fetch.calls.length, 1);
  const { searchParams } = new globalThis.URL(fetch.calls[0].url);
  assert.equal(searchParams.get("latitude")!.split(",").length, 49);
  assert.equal(searchParams.get("minutely_15"), "precipitation");
  // Rounded out to whole quarters of an hour.
  assert.equal(searchParams.get("start_minutely_15"), "2026-11-20T12:00");
  assert.equal(searchParams.get("end_minutely_15"), "2026-11-20T13:00");
  assert.equal(searchParams.get("timezone"), "UTC");
  assert.equal(grid.times.length, 5);
  assert.equal(grid.times[1], utc(2026, 11, 20, 12, 15));
  assert.equal(grid.frames[2][24], 0.2);
  assert.equal(grid.frames[2][0], null);
  assert.ok(grid.north > grid.south && grid.east > grid.west);
  // The middle of the grid is the track.
  assert.deepEqual(
    centreSeries(grid).map((point) => point.rain),
    [0, 0.1, 0.2, 0.30000000000000004, 0.4],
  );
  assert.equal(frameAt(grid, utc(2026, 11, 20, 12, 20)), 1);
  assert.equal(frameAt(grid, utc(2026, 11, 20, 11)), 0);
  assert.equal(frameAt(grid, utc(2026, 11, 20, 18)), 4);
});

test("a rain grid that is not 49 places, or empty, is refused", async () => {
  await assert.rejects(
    fetchRainGrid(
      SPA,
      0,
      HOUR,
      fakeFetch(json(gridAnswer(3, () => 0).slice(0, 10))),
    ),
    { message: "The rain forecast map came back in an unexpected format." },
  );
  await assert.rejects(
    fetchRainGrid(SPA, 0, HOUR, fakeFetch(json(gridAnswer(0, () => 0)))),
    /unexpected format/,
  );
  await assert.rejects(
    fetchRainGrid(SPA, 0, HOUR, fakeFetch(json({ minutely_15: {} }))),
    /unexpected format/,
  );
  await assert.rejects(
    fetchRainGrid(
      { name: "", latitude: 0, longitude: 0 },
      0,
      HOUR,
      fakeFetch(json([])),
    ),
    /no name/,
  );
});

test("rain colours: nothing for a trace, stronger for more", () => {
  assert.deepEqual(rainColour(0), [0, 0, 0, 0]);
  assert.deepEqual(rainColour(0.05), [0, 0, 0, 0]);
  assert.deepEqual(rainColour(Number.NaN), [0, 0, 0, 0]);
  const light = rainColour(0.5);
  const heavy = rainColour(15);
  assert.ok(light[3] > 0 && light[3] < heavy[3]);
  // Beyond the scale the colour stays the last one.
  assert.deepEqual(rainColour(500), rainColour(40));
});

test("a frame is blended between its grid points, as mm per hour", () => {
  // 2 by 2: 0.25 mm in 15 minutes (1 mm/h) on the left, none on the right.
  const pixels = interpolateFrame([0.25, 0, 0.25, null], 2, 3);
  assert.deepEqual([...pixels], [1, 0.5, 0, 1, 0.5, 0, 1, 0.5, 0]);
});

test("the time zone of a place", async () => {
  const fetch = fakeFetch(json({ timezone: "Asia/Tokyo" }));
  assert.equal(
    await fetchZone({ latitude: 35.37, longitude: 138.93 }, fetch),
    "Asia/Tokyo",
  );
  assert.equal(
    new globalThis.URL(fetch.calls[0].url).searchParams.get("timezone"),
    "auto",
  );
  await assert.rejects(
    fetchZone(SPA, fakeFetch(json({}))),
    /time zone could not be read/,
  );
});

test("radar frames: measured first, then RainViewer's own forecast", async () => {
  const frames = await radarFrames(
    fakeFetch(
      json({
        host: "https://tilecache.rainviewer.com",
        radar: {
          past: [{ time: 1000, path: "/a" }],
          nowcast: [{ time: 1600, path: "/b" }],
        },
      }),
    ),
  );
  assert.deepEqual(
    frames.map((frame) => [frame.time, frame.forecast]),
    [
      [1_000_000, false],
      [1_600_000, true],
    ],
  );
  // The list without a forecast part is fine too.
  const past = await radarFrames(
    fakeFetch(
      json({
        host: "https://tilecache.rainviewer.com",
        radar: { past: [{ time: 1000, path: "/a" }] },
      }),
    ),
  );
  assert.equal(past.length, 1);
});

// The circuit's shape

/** A 1000 m by 400 m rectangle driven clockwise from its south-west corner, in metres. */
const RECTANGLE = [
  { x: 0, y: 0 },
  { x: 0, y: 400 },
  { x: 1000, y: 400 },
  { x: 1000, y: 0 },
];

test("bearings and turns", () => {
  assert.equal(bearing({ x: 0, y: 0 }, { x: 0, y: 1 }), 0);
  assert.equal(bearing({ x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  assert.equal(bearing({ x: 0, y: 0 }, { x: -1, y: 0 }), 270);
  assert.equal(turn(350, 10), 20);
  assert.equal(turn(10, 350), -20);
  assert.equal(turn(90, 270), -180);
});

test("a loop every 10 m, and its straights", () => {
  const points = resample(RECTANGLE, 10);
  // 2800 m round.
  assert.equal(points.length, 280);
  const { straights } = shapeOf(RECTANGLE);
  assert.equal(straights.length, 4);
  // Longest first: the two long sides, east then west.
  assert.ok(straights[0].length >= 900 && straights[0].length <= 1000);
  assert.deepEqual(
    straights
      .map((straight) => Math.round(straight.bearing))
      .sort((a, b) => a - b),
    [0, 90, 180, 270],
  );
  assert.ok(straights[2].length < 400);
});

test("wind on a straight", () => {
  // Driving north into a wind from the north: all headwind.
  const head = windOn(0, 0, 10);
  assert.equal(head.kind, "headwind");
  assert.ok(Math.abs(head.head - 10) < 1e-9 && Math.abs(head.cross) < 1e-9);
  // Driving south with that wind behind.
  const tail = windOn(180, 0, 10);
  assert.equal(tail.kind, "tailwind");
  assert.ok(Math.abs(tail.head + 10) < 1e-9);
  // Driving east: it comes from the left.
  const cross = windOn(90, 0, 10);
  assert.equal(cross.kind, "crosswind");
  assert.ok(Math.abs(cross.cross + 10) < 1e-9);
  // From 45° off the nose: as much along as across, called a headwind.
  const quarter = windOn(0, 45, 10);
  assert.ok(Math.abs(quarter.head - quarter.cross) < 1e-9);
  assert.equal(windOn(350, 10, 5).kind, "headwind");
});

test("a drawing keeps north up and fits its box", () => {
  const drawn = fit(RECTANGLE, 500, 300, 20);
  const corners = RECTANGLE.map(drawn.point);
  for (const corner of corners) {
    assert.ok(corner.x >= 20 - 1e-9 && corner.x <= 480 + 1e-9);
    assert.ok(corner.y >= 20 - 1e-9 && corner.y <= 280 + 1e-9);
  }
  // The northern corners are drawn above the southern ones.
  assert.ok(corners[1].y < corners[0].y);
  assert.ok(Math.abs(drawn.scale - 0.46) < 1e-9);
  assert.match(pathOf(corners), /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){3}Z$/);
});

test("positions in metres around the middle", () => {
  const [a, b] = toMetres([
    [50, 6],
    [50.01, 6],
  ]);
  assert.ok(Math.abs(b.y - a.y - 1105.7) < 0.01);
  assert.ok(Math.abs(a.x) < 1e-6 && Math.abs(b.x) < 1e-6);
});

/** Official lap lengths in metres. */
const LAPS: Record<string, number> = {
  "red-bull-ring": 4318,
  spa: 7004,
  "paul-ricard": 5842,
  "magny-cours": 4411,
  hockenheim: 4574,
  nurburgring: 5148,
  hungaroring: 4381,
  monza: 5793,
  imola: 4909,
  mugello: 5245,
  zandvoort: 4259,
  portimao: 4653,
  barcelona: 4657,
  alcaniz: 5345,
  jerez: 4428,
  valencia: 4005,
};

test("every built-in circuit has an outline close to its lap length, at its place", () => {
  const all = outlines as unknown as Record<string, Outline>;
  for (const track of GRADE1_TRACKS) {
    const outline = all[track.id];
    assert.ok(outline, track.id);
    assert.ok(outline.loop.length > 40, track.id);
    // Measured again from the points that are shipped.
    const points = toMetres(outline.loop);
    let length = 0;
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      length += Math.hypot(next.x - point.x, next.y - point.y);
    });
    assert.ok(
      Math.abs(length - LAPS[track.id]) / LAPS[track.id] < 0.015,
      `${track.id}: ${Math.round(length)} m`,
    );
    // Its middle is within 1.5 km of the track's coordinates.
    const [offset] = toMetres(
      [[track.latitude, track.longitude]],
      [
        outline.loop.reduce((sum, p) => sum + p[0], 0) / outline.loop.length,
        outline.loop.reduce((sum, p) => sum + p[1], 0) / outline.loop.length,
      ],
    );
    assert.ok(Math.hypot(offset.x, offset.y) < 1500, track.id);
    // Driven the way it says: the area on the right for a clockwise lap.
    let area = 0;
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      area += point.x * next.y - next.x * point.y;
    });
    assert.equal(area < 0, outline.clockwise, track.id);
    assert.ok(shapeOf(points).straights.length >= 1, track.id);
  }
  assert.equal(Object.keys(all).length, GRADE1_TRACKS.length);
});

// The outline of an added track

const OVERPASS = {
  elements: [
    {
      type: "way",
      tags: { highway: "raceway", name: "Main" },
      geometry: [
        { lat: 27.45001234, lon: -81.35 },
        { lat: 27.451, lon: -81.351 },
      ],
    },
    {
      type: "way",
      tags: { highway: "raceway", sport: "karting" },
      geometry: [
        { lat: 27.46, lon: -81.36 },
        { lat: 27.461, lon: -81.361 },
      ],
    },
    { type: "way", tags: { name: "Kart track" }, geometry: [] },
  ],
};

test("an added track's outline: racetrack lines nearby, without the kart track", async () => {
  const fetch = fakeFetch(json(OVERPASS));
  const lines = await fetchTrackLines(
    { name: "Sebring", latitude: 27.4547, longitude: -81.3483 },
    fetch,
  );
  assert.deepEqual(lines, [
    [
      [27.45001, -81.35],
      [27.451, -81.351],
    ],
  ]);
  assert.equal(isLines(lines), true);
  assert.equal(isLines([[["a", 1]]]), false);
  const address = new globalThis.URL(fetch.calls[0].url);
  assert.equal(address.origin, "https://overpass-api.de");
  assert.match(
    address.searchParams.get("data")!,
    /way\[highway=raceway\]\(around:2500,27\.4547,-81\.3483\)/,
  );
});

test("an outline that cannot be fetched or read", async () => {
  const place = { name: "Sebring", latitude: 27.4547, longitude: -81.3483 };
  await assert.rejects(fetchTrackLines(place, fakeFetch(status(429))), {
    message: "The track outline could not be fetched right now.",
  });
  await assert.rejects(fetchTrackLines(place, fakeFetch(new TypeError("x"))), {
    message: "The track outline could not be fetched.",
  });
  await assert.rejects(
    fetchTrackLines(place, fakeFetch(json({ elements: "none" }))),
    /unexpected format/,
  );
  // No racetrack on the map there is an answer, not a failure.
  assert.deepEqual(
    await fetchTrackLines(place, fakeFetch(json({ elements: [] }))),
    [],
  );
});

test("dots that would cover each other are stacked, then moved aside", async () => {
  const { swarm } = await import("../web/src/lib/swarm.ts");
  // Apart: all on the middle row.
  assert.deepEqual(
    swarm([0, 10, 20]).map((dot) => dot.lane),
    [0, 0, 0],
  );
  // Six on one value: five rows, then the sixth one gap to the right.
  const bunch = swarm([50, 50, 50, 50, 50, 50]);
  assert.deepEqual(
    bunch.map((dot) => dot.lane),
    [0, -1, 1, -2, 2, 0],
  );
  assert.deepEqual(
    bunch.map((dot) => dot.x),
    [50, 50, 50, 50, 50, 53.4],
  );
  // No two dots of a row are closer than the gap.
  const many = swarm([0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 9, 9, 30]);
  for (const a of many)
    for (const b of many)
      if (a !== b && a.lane === b.lane)
        assert.ok(Math.abs(a.x - b.x) >= 3.4 - 1e-9);
});
