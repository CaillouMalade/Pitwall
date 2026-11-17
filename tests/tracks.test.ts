// Adding, editing and deleting tracks, and what is kept on the device.

import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE1_TRACKS } from "../web/src/data/grade1-tracks.ts";
import {
  loadProvidersOff,
  loadSnapshot,
  loadUnits,
  loadUserTracks,
  MAX_SNAPSHOTS,
  saveProvidersOff,
  saveSnapshot,
  saveUnits,
  saveUserTracks,
  USER_TRACKS_KEY,
  type KeyValueStore,
} from "../web/src/lib/storage.ts";
import {
  checkTrack,
  createTrack,
  formatCoordinates,
  newTrackId,
  trackSlug,
  TrackInputError,
} from "../web/src/lib/tracks.ts";
import type { Track } from "../web/src/lib/types.ts";
import { memoryStore } from "./helpers.ts";

const GRADE1 = [...GRADE1_TRACKS];

// The built-in list

test("the 16 Grade 1 circuits", () => {
  assert.equal(GRADE1.length, 16);
  const monza = GRADE1[7];
  assert.equal(monza.id, "monza");
  assert.equal(monza.name, "Monza");
  assert.equal(typeof monza.latitude, "number");
  assert.equal(new Set(GRADE1.map((track) => track.id)).size, 16);
});

// The checks, one message each

function errorFor(
  name: string,
  latitude: string,
  longitude: string,
  tracks: readonly Track[] = GRADE1,
  editingId?: string,
): string | null {
  try {
    checkTrack(name, latitude, longitude, tracks, editingId);
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

test("name too long", () => {
  assert.equal(
    errorFor("x".repeat(61), "45.62", "9.28"),
    "A track name has at most 60 characters.",
  );
  assert.equal(errorFor("x".repeat(60), "45.62", "9.28"), null);
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
  assert.equal(
    errorFor("Test", "Infinity", "9.28"),
    "Latitude must be between -90 and 90.",
  );
});

test("longitude not a number", () => {
  assert.equal(
    errorFor("Test", "45.62", ""),
    "Longitude must be a number, for example 5.97.",
  );
});

test("longitude out of range", () => {
  assert.equal(
    errorFor("Test", "45.62", "-200"),
    "Longitude must be between -180 and 180.",
  );
});

test("the first problem is the one reported", () => {
  assert.equal(
    errorFor("", "north", "east"),
    "Please enter a name for the track.",
  );
  try {
    checkTrack("Test", "north", "east", GRADE1);
    assert.fail("should have thrown");
  } catch (error) {
    assert.equal((error as TrackInputError).field, "latitude");
  }
});

// Any place on Earth

test("a track anywhere is accepted, with no circuit nearby", () => {
  // Madrid city centre, Sebring and Phillip Island: none is near a Grade 1 circuit.
  assert.equal(errorFor("Madrid", "40.4168", "-3.7038"), null);
  assert.equal(errorFor("Sebring", "27.4547", "-81.3483"), null);
  assert.equal(errorFor("Phillip Island", "-38.5", "145.23"), null);
  assert.equal(errorFor("Poles", "-90", "180"), null);
});

test("name and coordinates are tidied", () => {
  assert.deepEqual(
    checkTrack("  Circuit   de  Nevers ", " 46.86", "3.16 ", GRADE1),
    {
      name: "Circuit de Nevers",
      latitude: 46.86,
      longitude: 3.16,
    },
  );
  // A decimal comma, an explicit sign and an exponent are all numbers.
  assert.deepEqual(checkTrack("Comma", "46,86", "-3,16", GRADE1), {
    name: "Comma",
    latitude: 46.86,
    longitude: -3.16,
  });
  assert.equal(checkTrack("Sign", "+4.5e1", ".5", GRADE1).latitude, 45);
});

test("a new track gets an id of its own and no country", () => {
  const input = checkTrack("Sebring", "27.4547", "-81.3483", GRADE1);
  assert.deepEqual(createTrack(input, GRADE1), {
    id: "sebring",
    name: "Sebring",
    country: "",
    latitude: 27.4547,
    longitude: -81.3483,
  });
});

test("ids: slugs, and a number when the slug is taken", () => {
  assert.equal(trackSlug("Circuit de Nevers"), "circuit-de-nevers");
  assert.equal(
    trackSlug("Nürburgring  Nordschleife!"),
    "nurburgring-nordschleife",
  );
  assert.equal(trackSlug("鈴鹿"), "track");
  // "Spa" is a new name, but the built-in Spa-Francorchamps has the id "spa".
  assert.equal(newTrackId("Spa", GRADE1), "spa-2");
  const more = [...GRADE1, { ...GRADE1[1], id: "spa-2", name: "Spa" }];
  assert.equal(newTrackId("SPA!", more), "spa-3");
  assert.equal(newTrackId("Sebring", GRADE1), "sebring");
});

// Editing

const SEBRING: Track = {
  id: "sebring",
  name: "Sebring",
  country: "",
  latitude: 27.4547,
  longitude: -81.3483,
};

test("an edited track may keep its own name", () => {
  const tracks = [...GRADE1, SEBRING];
  assert.equal(
    errorFor("Sebring", "27.45", "-81.35", tracks),
    "A track called Sebring is already in the list.",
  );
  assert.equal(errorFor("Sebring", "27.45", "-81.35", tracks, "sebring"), null);
  assert.equal(
    errorFor("sebring raceway", "27.45", "-81.35", tracks, "sebring"),
    null,
  );
});

test("an edited track may not take another track's name", () => {
  assert.equal(
    errorFor("Monza", "27.45", "-81.35", [...GRADE1, SEBRING], "sebring"),
    "A track called Monza is already in the list.",
  );
});

test("an edit is checked like a new track", () => {
  assert.equal(
    errorFor("Sebring", "127", "-81.35", [...GRADE1, SEBRING], "sebring"),
    "Latitude must be between -90 and 90.",
  );
});

test("coordinates as text", () => {
  assert.equal(formatCoordinates(SEBRING), "27.4547° N, 81.3483° W");
  assert.equal(
    formatCoordinates({ latitude: -38.5, longitude: 145.23 }),
    "38.5000° S, 145.2300° E",
  );
});

// Saved tracks

test("no saved tracks is an empty list, and so is unreadable data", () => {
  const store = memoryStore();
  assert.deepEqual(loadUserTracks(store), []);
  store.setItem(USER_TRACKS_KEY, "{not json");
  assert.deepEqual(loadUserTracks(store), []);
  store.setItem(USER_TRACKS_KEY, JSON.stringify([{ id: 1 }, null]));
  assert.deepEqual(loadUserTracks(store), []);
  // A saved track with coordinates off the Earth is dropped, the others kept.
  store.setItem(
    USER_TRACKS_KEY,
    JSON.stringify([{ ...SEBRING, latitude: 127 }, SEBRING]),
  );
  assert.deepEqual(loadUserTracks(store), [SEBRING]);
});

test("add, edit and delete a saved track", () => {
  const store = memoryStore();
  const daytona = createTrack(
    checkTrack("Daytona", "29.185", "-81.0705", [...GRADE1, SEBRING]),
    [...GRADE1, SEBRING],
  );
  saveUserTracks([SEBRING, daytona], store);
  assert.deepEqual(
    loadUserTracks(store).map((track) => track.name),
    ["Sebring", "Daytona"],
  );

  // Edit: new name and place, same id.
  const edited = {
    ...SEBRING,
    ...checkTrack(
      "Sebring Raceway",
      "27.455",
      "-81.349",
      [...GRADE1, ...loadUserTracks(store)],
      SEBRING.id,
    ),
  };
  saveUserTracks(
    loadUserTracks(store).map((track) =>
      track.id === edited.id ? edited : track,
    ),
    store,
  );
  assert.deepEqual(loadUserTracks(store)[0], {
    id: "sebring",
    name: "Sebring Raceway",
    country: "",
    latitude: 27.455,
    longitude: -81.349,
  });

  // Delete.
  saveUserTracks(
    loadUserTracks(store).filter((track) => track.id !== "sebring"),
    store,
  );
  assert.deepEqual(
    loadUserTracks(store).map((track) => track.id),
    ["daytona"],
  );
  assert.equal([...GRADE1, ...loadUserTracks(store)].length, 17);
});

test("a store that refuses writes gives a clear message", () => {
  const store: KeyValueStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.throws(
    () => saveUserTracks([SEBRING], store),
    /Could not save on this device/,
  );
});

// Preferences

test("units are kept, and anything unreadable falls back", () => {
  const store = memoryStore();
  const fallback = { temperature: "c", wind: "kmh" } as const;
  assert.deepEqual(loadUnits(fallback, store), fallback);
  saveUnits({ temperature: "f", wind: "mph" }, store);
  assert.deepEqual(loadUnits(fallback, store), {
    temperature: "f",
    wind: "mph",
  });
  store.setItem("pitwall-units", JSON.stringify({ temperature: "k" }));
  assert.deepEqual(loadUnits(fallback, store), fallback);
});

test("the services turned off are kept, unknown ones dropped", () => {
  const store = memoryStore();
  // Before any choice: the one service that is off by default.
  assert.deepEqual(loadProvidersOff(store), ["geosphere"]);
  saveProvidersOff([], store);
  assert.deepEqual(loadProvidersOff(store), []);
  saveProvidersOff(["nws", "fmi"], store);
  assert.deepEqual(loadProvidersOff(store), ["nws", "fmi"]);
  store.setItem("pitwall-sources-off", JSON.stringify(["nws", "gone", 3]));
  assert.deepEqual(loadProvidersOff(store), ["nws"]);
});

test("the last forecast of a place is kept, for a few places", () => {
  const store = memoryStore();
  const point = {
    source: "ecmwf-ifs",
    time: 0,
    temperature: 9,
    windSpeed: 4,
    windDeg: 225,
    rain: 0,
  };
  assert.equal(loadSnapshot("45.62,9.28", store), null);
  saveSnapshot("45.62,9.28", { at: 1000, points: [point] }, store);
  assert.deepEqual(loadSnapshot("45.62,9.28", store), {
    at: 1000,
    points: [point],
  });
  // Only the most recent places are kept.
  for (let place = 1; place <= MAX_SNAPSHOTS; place++)
    saveSnapshot(`${place},0`, { at: 1000 + place, points: [] }, store);
  assert.equal(loadSnapshot("45.62,9.28", store), null);
  assert.equal(loadSnapshot("1,0", store)!.at, 1001);
  store.setItem("pitwall-forecasts", "not json");
  assert.equal(loadSnapshot("1,0", store), null);
});
