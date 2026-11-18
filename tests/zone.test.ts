// Track local time: what "14:00 at the track" is, and how it reads back.

import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE1_TRACKS } from "../web/src/data/grade1-tracks.ts";
import {
  formatClock,
  formatCountdown,
  formatDayTime,
} from "../web/src/lib/format.ts";
import {
  addDays,
  isZone,
  localDay,
  localMidnight,
  trackZone,
  zonedTime,
  zoneName,
  zoneOffset,
} from "../web/src/lib/zone.ts";
import { utc } from "./helpers.ts";

const HOUR = 3_600_000;

test("offsets follow summer and winter time", () => {
  assert.equal(zoneOffset(utc(2026, 1, 15), "Europe/Brussels"), HOUR);
  assert.equal(zoneOffset(utc(2026, 7, 15), "Europe/Brussels"), 2 * HOUR);
  assert.equal(zoneOffset(utc(2026, 7, 15), "America/New_York"), -4 * HOUR);
  assert.equal(zoneOffset(utc(2026, 7, 15), "Asia/Kolkata"), 5.5 * HOUR);
  assert.equal(zoneOffset(utc(2026, 7, 15), "UTC"), 0);
});

test("a local day and time is one moment", () => {
  assert.equal(
    zonedTime("2026-11-20", 14 * 60, "Europe/Brussels"),
    utc(2026, 11, 20, 13),
  );
  assert.equal(
    zonedTime("2026-07-20", 14 * 60, "Europe/Brussels"),
    utc(2026, 7, 20, 12),
  );
  assert.equal(zonedTime("2026-11-20", 0, "Asia/Tokyo"), utc(2026, 11, 19, 15));
  assert.equal(
    zonedTime("2026-11-20", 8 * 60 + 30, "UTC"),
    utc(2026, 11, 20, 8, 30),
  );
});

test("the hours around a clock change", () => {
  // 29 March 2026, Brussels: 02:00 to 03:00 does not exist.
  assert.equal(
    zonedTime("2026-03-29", 60, "Europe/Brussels"),
    utc(2026, 3, 29, 0),
  );
  assert.equal(
    zonedTime("2026-03-29", 180, "Europe/Brussels"),
    utc(2026, 3, 29, 1),
  );
  // A time inside the gap lands on the hour after it.
  assert.equal(
    zonedTime("2026-03-29", 150, "Europe/Brussels"),
    utc(2026, 3, 29, 1, 30),
  );
});

test("the day at the track, and its midnight", () => {
  const late = utc(2026, 11, 16, 23, 30);
  assert.equal(localDay(late, "UTC"), "2026-11-16");
  assert.equal(localDay(late, "Europe/Brussels"), "2026-11-17");
  assert.equal(localDay(late, "America/Los_Angeles"), "2026-11-16");
  assert.equal(localMidnight(late, "Europe/Brussels"), utc(2026, 11, 16, 23));
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
});

test("only real zones are used", () => {
  assert.equal(isZone("Europe/Brussels"), true);
  assert.equal(isZone("Mars/Olympus"), false);
  assert.equal(isZone(""), false);
  assert.equal(isZone(undefined), false);
  assert.equal(trackZone({ timezone: "Europe/Rome" }), "Europe/Rome");
  // Until a track's zone is known, its times are UTC.
  assert.equal(trackZone({}), "UTC");
  assert.equal(trackZone({ timezone: "Mars/Olympus" }), "UTC");
});

test("every built-in circuit has a time zone this computer knows", () => {
  for (const track of GRADE1_TRACKS)
    assert.equal(isZone(track.timezone), true, track.id);
});

test("times are written on the track's clock", () => {
  const time = utc(2026, 11, 20, 13);
  assert.equal(formatClock(time, "Europe/Brussels"), "14:00");
  assert.equal(formatClock(time), "13:00");
  assert.equal(formatDayTime(time, "Asia/Tokyo"), "Fri 20 Nov, 22:00");
  // Midnight is 00:00, not 24:00.
  assert.equal(formatClock(utc(2026, 11, 20, 23), "Europe/Brussels"), "00:00");
  assert.equal(zoneName(time, "UTC"), "UTC");
  assert.equal(zoneName(time, "Europe/Brussels"), "CET");
  assert.equal(zoneName(utc(2026, 7, 20), "Europe/Brussels"), "CEST");
});

test("countdown", () => {
  const now = utc(2026, 11, 20, 12);
  assert.equal(formatCountdown(now, now + 35 * 60_000), "in 35 min");
  assert.equal(
    formatCountdown(now, now + 2 * HOUR + 15 * 60_000),
    "in 2 h 15 min",
  );
  assert.equal(formatCountdown(now, now + 22 * HOUR), "in 22 h");
  assert.equal(formatCountdown(now, now + 52 * HOUR), "in 2 d 4 h");
  assert.equal(formatCountdown(now, now - 3 * HOUR), "3 h ago");
  assert.equal(formatCountdown(now, now + 20_000), "now");
});
