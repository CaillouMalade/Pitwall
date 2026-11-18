// The weekend: the default sessions, and a track's own.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPlan,
  checkTypeName,
  DEFAULT_PLAN,
  formatLength,
  matchingType,
  parseDay,
  planFromType,
  PlanInputError,
  readPlan,
  sameSessions,
  sessionTimes,
  STANDARD_TYPE,
  weekendEnd,
  weekendStart,
  type WeekendPlan,
  type WeekendType,
} from "../web/src/lib/sessions.ts";
import {
  loadPlans,
  loadWeekendTypes,
  savePlan,
  saveWeekendTypes,
} from "../web/src/lib/storage.ts";
import { memoryStore, utc } from "./helpers.ts";

// The default weekend

test("the weekend starts tomorrow", () => {
  assert.equal(weekendStart(utc(2026, 11, 16, 18, 30)), utc(2026, 11, 17));
});

test("the weekend crosses the end of a month", () => {
  assert.equal(weekendStart(utc(2026, 11, 30, 9)), utc(2026, 12, 1));
});

test("default session times in UTC", () => {
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
  // Practice lasts an hour, the race two.
  assert.equal(sessions[0].end, utc(2026, 11, 17, 9));
  assert.equal(sessions.at(-1)!.end, utc(2026, 11, 19, 15));
});

// The track's own clock

test("sessions are in the track's local time", () => {
  // Spa in November is one hour ahead of UTC.
  const now = utc(2026, 11, 16, 10);
  const sessions = sessionTimes(now, DEFAULT_PLAN, "Europe/Brussels");
  assert.equal(sessions[0].start, utc(2026, 11, 17, 7));
  assert.equal(
    weekendStart(now, DEFAULT_PLAN, "Europe/Brussels"),
    utc(2026, 11, 16, 23),
  );
  assert.equal(
    weekendEnd(now, DEFAULT_PLAN, "Europe/Brussels"),
    utc(2026, 11, 19, 23),
  );
});

test("tomorrow is tomorrow at the track, not in UTC", () => {
  // 23:30 UTC on the 16th is already the 17th at 08:30 in Tokyo.
  const now = utc(2026, 11, 16, 23, 30);
  const [fp1] = sessionTimes(now, DEFAULT_PLAN, "Asia/Tokyo");
  // 08:00 on the 18th in Tokyo is 23:00 UTC on the 17th.
  assert.equal(fp1.start, utc(2026, 11, 17, 23));
});

test("a weekend over a clock change keeps its local times", () => {
  // Clocks go back in Brussels on 25 October 2026.
  const plan = { ...DEFAULT_PLAN, start: "2026-10-24" };
  const sessions = sessionTimes(0, plan, "Europe/Brussels");
  // Saturday 08:00 is UTC+2, Sunday 13:00 is UTC+1.
  assert.equal(sessions[0].start, utc(2026, 10, 24, 6));
  assert.equal(sessions.at(-1)!.start, utc(2026, 10, 26, 12));
  // The weekend is 73 hours long.
  assert.equal(
    weekendEnd(0, plan, "Europe/Brussels") -
      weekendStart(0, plan, "Europe/Brussels"),
    73 * 3_600_000,
  );
});

// A track's own weekend

const SPRINT: WeekendPlan = {
  start: "2026-11-27",
  sessions: [
    { name: "Race", day: 2, time: "15:30", minutes: 90 },
    { name: "FP1", day: 0, time: "09:30", minutes: 60 },
    { name: "Sprint", day: 1, time: "11:00", minutes: 30 },
  ],
};

test("a weekend with its own date and sessions", () => {
  const now = utc(2026, 11, 16, 10);
  assert.equal(weekendStart(now, SPRINT), utc(2026, 11, 27));
  // Listed earliest first, whatever the order they were entered in.
  assert.deepEqual(sessionTimes(now, SPRINT), [
    {
      name: "FP1",
      start: utc(2026, 11, 27, 9, 30),
      end: utc(2026, 11, 27, 10, 30),
    },
    {
      name: "Sprint",
      start: utc(2026, 11, 28, 11),
      end: utc(2026, 11, 28, 11, 30),
    },
    {
      name: "Race",
      start: utc(2026, 11, 29, 15, 30),
      end: utc(2026, 11, 29, 17),
    },
  ]);
});

test("a dated weekend does not move with the days", () => {
  assert.equal(weekendStart(utc(2026, 11, 20), SPRINT), utc(2026, 11, 27));
  assert.equal(weekendStart(utc(2026, 12, 5), SPRINT), utc(2026, 11, 27));
});

test("own sessions without a date still start tomorrow", () => {
  const plan = { ...SPRINT, start: null };
  assert.equal(
    sessionTimes(utc(2026, 11, 16, 10), plan)[0].start,
    utc(2026, 11, 17, 9, 30),
  );
});

test("real dates only", () => {
  assert.equal(parseDay("2026-11-27"), utc(2026, 11, 27));
  assert.equal(parseDay("2026-02-31"), null);
  assert.equal(parseDay("27/11/2026"), null);
  assert.equal(parseDay(""), null);
});

// Checking an edited weekend

type Typed = { name: string; day: number; time: string; minutes?: number }[];

function errorFor(start: string, sessions: Typed) {
  try {
    checkPlan(start, sessions);
  } catch (error) {
    assert.ok(error instanceof PlanInputError);
    return [error.row, error.message];
  }
  return null;
}

const one = [{ name: "Race", day: 2, time: "13:00", minutes: 120 }];

test("a checked weekend is tidied", () => {
  assert.deepEqual(
    checkPlan(" 2026-11-27 ", [
      { name: "  Race ", day: 2, time: "13:00", minutes: 120 },
    ]),
    { start: "2026-11-27", sessions: one },
  );
  assert.deepEqual(checkPlan("", one), { start: null, sessions: one });
});

test("each problem has its own message and row", () => {
  assert.deepEqual(errorFor("tomorrow", one), [
    null,
    "The first day must be a date.",
  ]);
  assert.deepEqual(errorFor("", []), [null, "Add at least one session."]);
  assert.deepEqual(
    errorFor(
      "",
      Array.from({ length: 9 }, (_, i) => ({
        name: `S${i}`,
        day: 0,
        time: "10:00",
      })),
    ),
    [null, "A weekend has at most 8 sessions."],
  );
  assert.deepEqual(
    errorFor("", [...one, { name: " ", day: 0, time: "10:00" }]),
    [1, "Every session needs a name."],
  );
  assert.deepEqual(
    errorFor("", [{ name: "x".repeat(21), day: 0, time: "10:00" }]),
    [0, "A session name has at most 20 characters."],
  );
  assert.deepEqual(
    errorFor("", [...one, { name: "race", day: 0, time: "10:00" }]),
    [1, "There are two sessions called race."],
  );
  assert.deepEqual(errorFor("", [{ name: "Race", day: 3, time: "13:00" }]), [
    0,
    "Race must be on day 1, 2 or 3.",
  ]);
  assert.deepEqual(errorFor("", [{ name: "Race", day: 0, time: "25:00" }]), [
    0,
    "Race needs a time, for example 14:00.",
  ]);
  assert.deepEqual(errorFor("", [{ name: "Race", day: 0, time: "" }]), [
    0,
    "Race needs a time, for example 14:00.",
  ]);
  for (const minutes of [0, 4, 1441, 12.5, Number.NaN])
    assert.deepEqual(
      errorFor("", [{ name: "Race", day: 0, time: "13:00", minutes }]),
      [0, "Race must last between 5 minutes and 24 hours."],
      String(minutes),
    );
});

test("a session without a length lasts an hour", () => {
  assert.equal(
    checkPlan("", [{ name: "FP1", day: 0, time: "08:00" }]).sessions[0].minutes,
    60,
  );
  assert.equal(formatLength(45), "45 min");
  assert.equal(formatLength(60), "1 h");
  assert.equal(formatLength(90), "1 h 30");
});

// Weekend types

const SPRINT_TYPE: WeekendType = {
  id: "type-1",
  name: "Sprint weekend",
  sessions: SPRINT.sessions,
};

test("the standard type is the default weekend", () => {
  assert.deepEqual(planFromType(STANDARD_TYPE), DEFAULT_PLAN);
  assert.equal(
    sameSessions(STANDARD_TYPE.sessions, DEFAULT_PLAN.sessions),
    true,
  );
  assert.equal(sameSessions(SPRINT.sessions, DEFAULT_PLAN.sessions), false);
  // A changed length is a different list.
  assert.equal(
    sameSessions(
      DEFAULT_PLAN.sessions,
      DEFAULT_PLAN.sessions.map((session) => ({ ...session, minutes: 45 })),
    ),
    false,
  );
});

test("sessions are matched to the type they are equal to", () => {
  const types = [STANDARD_TYPE, SPRINT_TYPE];
  assert.equal(matchingType(SPRINT.sessions, types), SPRINT_TYPE);
  assert.equal(matchingType(DEFAULT_PLAN.sessions, types), STANDARD_TYPE);
  assert.equal(matchingType(one, types), null);
});

test("a type needs a name of its own", () => {
  const types = [STANDARD_TYPE, SPRINT_TYPE];
  assert.equal(checkTypeName("  Test   day ", types), "Test day");
  assert.throws(
    () => checkTypeName(" ", types),
    /Give the weekend type a name/,
  );
  assert.throws(
    () => checkTypeName("sprint weekend", types),
    /already a weekend type called sprint weekend/,
  );
  assert.throws(() => checkTypeName("x".repeat(31), types), /at most 30/);
  // Renaming a type to its own name is fine.
  assert.equal(
    checkTypeName("Sprint weekend", types, "type-1"),
    "Sprint weekend",
  );
});

test("weekend types are kept, with the one that is the default", () => {
  const store = memoryStore();
  assert.deepEqual(loadWeekendTypes(store), {
    types: [STANDARD_TYPE],
    defaultId: "standard",
  });
  const saved = saveWeekendTypes(
    { types: [STANDARD_TYPE, SPRINT_TYPE], defaultId: "type-1" },
    store,
  );
  assert.deepEqual(saved, loadWeekendTypes(store));
  assert.equal(saved.defaultId, "type-1");
  assert.deepEqual(saved.types[1], SPRINT_TYPE);
  // The standard type is never written, so it cannot be changed from the file.
  assert.ok(!store.getItem("pitwall-weekend-types")!.includes("Standard"));
  // Deleting the default type puts the standard one back.
  assert.equal(
    saveWeekendTypes({ types: [STANDARD_TYPE], defaultId: "type-1" }, store)
      .defaultId,
    "standard",
  );
});

test("unusable saved types are dropped", () => {
  const store = memoryStore();
  store.setItem(
    "pitwall-weekend-types",
    JSON.stringify({
      types: [
        SPRINT_TYPE,
        { id: "standard", name: "Fake", sessions: one },
        { id: "type-2", name: "", sessions: one },
        { id: "type-3", name: "Empty", sessions: [] },
        { ...SPRINT_TYPE, name: "Same id" },
        "FP1",
      ],
      defaultId: "gone",
    }),
  );
  const loaded = loadWeekendTypes(store);
  assert.deepEqual(
    loaded.types.map((type) => type.name),
    ["Standard weekend", "Sprint weekend"],
  );
  assert.equal(loaded.defaultId, "standard");
  store.setItem("pitwall-weekend-types", "[1, 2]");
  assert.equal(loadWeekendTypes(store).types.length, 1);
});

// Kept per track

test("each track keeps its own weekend, the others the default", () => {
  const store = memoryStore();
  assert.deepEqual(loadPlans(store), {});
  savePlan("spa", SPRINT, store);
  savePlan("sebring", { ...DEFAULT_PLAN, start: "2027-03-19" }, store);
  const plans = loadPlans(store);
  assert.deepEqual(plans.spa, SPRINT);
  assert.equal(plans.sebring.start, "2027-03-19");
  assert.equal(plans.monza, undefined);
  // Back to the default.
  assert.deepEqual(Object.keys(savePlan("spa", null, store)), ["sebring"]);
  assert.deepEqual(Object.keys(loadPlans(store)), ["sebring"]);
});

test("a saved weekend that cannot be used is dropped", () => {
  const store = memoryStore();
  store.setItem(
    "pitwall-weekends",
    JSON.stringify({
      spa: SPRINT,
      monza: { start: null, sessions: [] },
      imola: { start: "soon", sessions: one },
      jerez: "FP1",
    }),
  );
  assert.deepEqual(Object.keys(loadPlans(store)), ["spa"]);
  assert.deepEqual(readPlan(SPRINT), SPRINT);
  assert.equal(readPlan(null), null);
  store.setItem("pitwall-weekends", "[1, 2]");
  assert.deepEqual(loadPlans(store), {});
});

test("a weekend saved before sessions had a length still loads", () => {
  const store = memoryStore();
  store.setItem(
    "pitwall-weekends",
    JSON.stringify({
      spa: { start: null, sessions: [{ name: "Race", day: 2, time: "13:00" }] },
    }),
  );
  assert.deepEqual(loadPlans(store).spa.sessions, [
    { name: "Race", day: 2, time: "13:00", minutes: 60 },
  ]);
});
