// The weekend: the default sessions, and a track's own.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPlan,
  DEFAULT_PLAN,
  isDefaultPlan,
  isPlan,
  parseDay,
  PlanInputError,
  sessionTimes,
  weekendStart,
  type WeekendPlan,
} from "../web/src/lib/sessions.ts";
import { loadPlans, savePlan } from "../web/src/lib/storage.ts";
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
});

// A track's own weekend

const SPRINT: WeekendPlan = {
  start: "2026-11-27",
  sessions: [
    { name: "Race", day: 2, time: "15:30" },
    { name: "FP1", day: 0, time: "09:30" },
    { name: "Sprint", day: 1, time: "11:00" },
  ],
};

test("a weekend with its own date and sessions", () => {
  const now = utc(2026, 11, 16, 10);
  assert.equal(weekendStart(now, SPRINT), utc(2026, 11, 27));
  // Listed earliest first, whatever the order they were entered in.
  assert.deepEqual(sessionTimes(now, SPRINT), [
    { name: "FP1", start: utc(2026, 11, 27, 9, 30) },
    { name: "Sprint", start: utc(2026, 11, 28, 11) },
    { name: "Race", start: utc(2026, 11, 29, 15, 30) },
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

function errorFor(start: string, sessions: WeekendPlan["sessions"]) {
  try {
    checkPlan(start, sessions);
  } catch (error) {
    assert.ok(error instanceof PlanInputError);
    return [error.row, error.message];
  }
  return null;
}

const one = [{ name: "Race", day: 2, time: "13:00" }];

test("a checked weekend is tidied", () => {
  assert.deepEqual(
    checkPlan(" 2026-11-27 ", [{ name: "  Race ", day: 2, time: "13:00" }]),
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
});

test("the default weekend is recognised", () => {
  assert.equal(isDefaultPlan(DEFAULT_PLAN), true);
  assert.equal(isDefaultPlan(checkPlan("", DEFAULT_PLAN.sessions)), true);
  assert.equal(isDefaultPlan(SPRINT), false);
  assert.equal(isDefaultPlan({ ...DEFAULT_PLAN, start: "2026-11-27" }), false);
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
  assert.equal(isPlan(SPRINT), true);
  assert.equal(isPlan(null), false);
  store.setItem("pitwall-weekends", "[1, 2]");
  assert.deepEqual(loadPlans(store), {});
});
