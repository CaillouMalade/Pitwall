// The race weekend: three days of sessions, in UTC. Every track starts with the
// same default weekend, and each can have its own.

import { DAY, HOUR } from "./windows.ts";

export const WEEKEND_DAYS = 3;
export const MAX_SESSIONS = 8;
export const MAX_NAME_LENGTH = 20;

export interface SessionPlan {
  name: string;
  /** Day of the weekend, counted from 0. */
  day: number;
  /** "08:00", in UTC. */
  time: string;
}

export interface WeekendPlan {
  /** The first day as "2026-11-20", or null for "always starting tomorrow". */
  start: string | null;
  sessions: SessionPlan[];
}

export const DEFAULT_SESSIONS: readonly SessionPlan[] = [
  { name: "FP1", day: 0, time: "08:00" },
  { name: "FP2", day: 0, time: "14:00" },
  { name: "FP3", day: 1, time: "08:00" },
  { name: "Qualifying", day: 1, time: "14:00" },
  { name: "Race", day: 2, time: "13:00" },
];

export const DEFAULT_PLAN: WeekendPlan = {
  start: null,
  sessions: DEFAULT_SESSIONS.map((session) => ({ ...session })),
};

export interface Session {
  name: string;
  start: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A "2026-11-20" day as its midnight in UTC, or null when it is not a real date. */
export function parseDay(text: string): number | null {
  if (!DATE.test(text)) return null;
  const time = Date.parse(text + "T00:00:00Z");
  // "2026-02-31" parses in some engines as 3 March: it must read back the same.
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== text)
    return null;
  return time;
}

/** The first day of the weekend at 00:00 UTC: the plan's date, or tomorrow. */
export function weekendStart(
  now: number = Date.now(),
  plan: WeekendPlan = DEFAULT_PLAN,
): number {
  const fixed = plan.start === null ? null : parseDay(plan.start);
  return fixed ?? Math.floor(now / DAY) * DAY + DAY;
}

function minutes(time: string): number {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** The sessions of a weekend with their start times, earliest first. */
export function sessionTimes(
  now: number = Date.now(),
  plan: WeekendPlan = DEFAULT_PLAN,
): Session[] {
  const first = weekendStart(now, plan);
  return plan.sessions
    .map((session) => ({
      name: session.name,
      start: first + session.day * DAY + (minutes(session.time) * HOUR) / 60,
    }))
    .sort((a, b) => a.start - b.start);
}

/** A check that failed, with a message to show next to the form. */
export class PlanInputError extends Error {
  /** The row at fault, or null for the date. */
  readonly row: number | null;
  constructor(row: number | null, message: string) {
    super(message);
    this.name = "PlanInputError";
    this.row = row;
  }
}

/** Check an edited weekend before saving it. An empty date means "from tomorrow". */
export function checkPlan(
  startText: string,
  sessions: readonly { name: string; day: number; time: string }[],
): WeekendPlan {
  const start = startText.trim();
  if (start !== "" && parseDay(start) === null)
    throw new PlanInputError(null, "The first day must be a date.");
  if (sessions.length === 0)
    throw new PlanInputError(null, "Add at least one session.");
  if (sessions.length > MAX_SESSIONS)
    throw new PlanInputError(
      null,
      `A weekend has at most ${MAX_SESSIONS} sessions.`,
    );
  const names = new Set<string>();
  const checked = sessions.map((session, row) => {
    const name = session.name.trim();
    if (name === "")
      throw new PlanInputError(row, "Every session needs a name.");
    if (name.length > MAX_NAME_LENGTH)
      throw new PlanInputError(
        row,
        `A session name has at most ${MAX_NAME_LENGTH} characters.`,
      );
    if (names.has(name.toLowerCase()))
      throw new PlanInputError(row, `There are two sessions called ${name}.`);
    names.add(name.toLowerCase());
    if (
      !Number.isInteger(session.day) ||
      session.day < 0 ||
      session.day >= WEEKEND_DAYS
    )
      throw new PlanInputError(row, `${name} must be on day 1, 2 or 3.`);
    if (!TIME.test(session.time))
      throw new PlanInputError(row, `${name} needs a time, for example 14:00.`);
    return { name, day: session.day, time: session.time };
  });
  return { start: start === "" ? null : start, sessions: checked };
}

/** True for a saved value that is a usable weekend. */
export function isPlan(value: unknown): value is WeekendPlan {
  const plan = value as WeekendPlan | null;
  if (typeof plan !== "object" || plan === null) return false;
  if (!Array.isArray(plan.sessions)) return false;
  try {
    checkPlan(plan.start ?? "", plan.sessions);
    return true;
  } catch {
    return false;
  }
}

/** True when a plan is the default weekend. */
export function isDefaultPlan(plan: WeekendPlan): boolean {
  return JSON.stringify(plan) === JSON.stringify(DEFAULT_PLAN);
}
