import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE1_TRACKS } from "../web/src/data/grade1-tracks.ts";
import { sessionTimes, weekendStart } from "../web/src/lib/sessions.ts";
import {
  appendUserTrack,
  loadUserTracks,
  USER_TRACKS_KEY,
  type KeyValueStore,
} from "../web/src/lib/storage.ts";
import {
  checkNewTrack,
  distanceKm,
  NOT_FOUND_MESSAGE,
  TrackInputError,
} from "../web/src/lib/tracks.ts";
import { utc } from "./helpers.ts";

const GRADE1 = [...GRADE1_TRACKS];

// Sessions

test("the weekend starts tomorrow", () => {
  assert.equal(weekendStart(utc(2026, 11, 16, 18, 30)), utc(2026, 11, 17));
});

test("the weekend crosses the end of a month", () => {
  assert.equal(weekendStart(utc(2026, 11, 30, 9)), utc(2026, 12, 1));
});

test("session times in UTC", () => {
  const sessions = sessionTimes(utc(2026, 11, 16, 10));
  assert.deepEqual(
    sessions.map((session) => session.name),
    ["FP1", "FP2", "FP3", "Qualifying", "Race"],
  );
  assert.equal(sessions[0].start, utc(2026, 11, 17, 8));
  assert.equal(sessions[1].start, utc(2026, 11, 17, 14));
  assert.equal(sessions[2].start, utc(2026, 11, 18, 8));
  assert.equal(sessions[3].start, utc(2026, 11, 18, 14));
  assert.equal(sessions.at(-1)!.start, utc(2026, 11, 19, 13));
});

// Track list and saved tracks

test("the 16 Grade 1 circuits", () => {
  assert.equal(GRADE1.length, 16);
  const monza = GRADE1[7];
  assert.equal(monza.id, "monza");
  assert.equal(monza.name, "Monza");
  assert.equal(typeof monza.latitude, "number");
  assert.equal(new Set(GRADE1.map((track) => track.id)).size, 16);
});

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

test("no saved tracks is an empty list, and so is unreadable data", () => {
  const store = memoryStore();
  assert.deepEqual(loadUserTracks(store), []);
  store.setItem(USER_TRACKS_KEY, "{not json");
  assert.deepEqual(loadUserTracks(store), []);
  store.setItem(USER_TRACKS_KEY, JSON.stringify([{ id: 1 }, null]));
  assert.deepEqual(loadUserTracks(store), []);
});

test("append a track, then load all", () => {
  const store = memoryStore();
  const track = {
    id: "monza-pit",
    name: "Monza pit",
    country: "Italy",
    latitude: 45.62,
    longitude: 9.28,
  };
  appendUserTrack(track, store);
  appendUserTrack({ ...track, id: "monza-pit-2", name: "Monza pit 2" }, store);
  const all = [...GRADE1, ...loadUserTracks(store)];
  assert.equal(all.length, 18);
  assert.equal(all.at(-1)!.name, "Monza pit 2");
});

test("a store that refuses writes gives a clear message", () => {
  const store: KeyValueStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.throws(
    () => appendUserTrack(GRADE1[0], store),
    /Could not save the track on this device/,
  );
});

// Distance

test("distance to the same point is zero", () => {
  assert.equal(distanceKm(45.6, 9.28, 45.6, 9.28), 0);
});

test("distance Madrid to Barcelona", () => {
  const distance = distanceKm(40.4168, -3.7038, 41.3874, 2.1686);
  assert.ok(distance > 495 && distance < 515);
});

// The checks, one message each

function errorFor(
  name: string,
  latitude: string,
  longitude: string,
): string | null {
  try {
    checkNewTrack(name, latitude, longitude, GRADE1, GRADE1);
  } catch (error) {
    assert.ok(error instanceof TrackInputError);
    return error.message;
  }
  return null;
}

test("empty name", () => {
  assert.equal(
    errorFor("   ", "45.62", "9.28"),
    "Please enter a name for the track.",
  );
});

test("name already used, any case", () => {
  assert.equal(
    errorFor("monza", "45.62", "9.28"),
    "A track called Monza is already in the list.",
  );
});

test("latitude not a number", () => {
  assert.equal(
    errorFor("Test", "north", "9.28"),
    "Latitude must be a number, for example 50.43.",
  );
  assert.equal(
    errorFor("Test", "12abc", "9.28"),
    "Latitude must be a number, for example 50.43.",
  );
});

test("latitude out of range", () => {
  assert.equal(
    errorFor("Test", "95", "9.28"),
    "Latitude must be between -90 and 90.",
  );
});

test("latitude nan is rejected", () => {
  assert.equal(
    errorFor("Test", "nan", "9.28"),
    "Latitude must be between -90 and 90.",
  );
});

test("longitude not a number", () => {
  assert.equal(
    errorFor("Test", "45.62", ""),
    "Longitude must be a number, for example 50.43.",
  );
});

test("longitude out of range", () => {
  assert.equal(
    errorFor("Test", "45.62", "-200"),
    "Longitude must be between -180 and 180.",
  );
});

test("far from any circuit", () => {
  // Madrid city centre: no Grade 1 circuit nearby.
  assert.equal(errorFor("Madrid", "40.4168", "-3.7038"), NOT_FOUND_MESSAGE);
});

test("close to a circuit is accepted", () => {
  assert.equal(errorFor("Monza Parabolica", "45.615", "9.29"), null);
  assert.deepEqual(
    checkNewTrack(" Monza Parabolica ", " 45.615", "9.29 ", GRADE1, GRADE1),
    {
      id: "monza-parabolica",
      name: "Monza Parabolica",
      country: "Italy",
      latitude: 45.615,
      longitude: 9.29,
    },
  );
});
