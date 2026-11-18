// The race weekend: three days of sessions, in the track's local time. A
// weekend type is a named list of sessions; one type is the default every track
// starts with, and each track can have a weekend of its own.

import { addDays, localDay, zonedTime } from "./zone.ts";

export const WEEKEND_DAYS = 3;
export const MAX_SESSIONS = 8;
export const MAX_NAME_LENGTH = 20;
export const MAX_TYPES = 12;
export const DEFAULT_MINUTES = 60;
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 24 * 60;

export interface SessionPlan {
  name: string;
  /** Day of the weekend, counted from 0. */
  day: number;
  /** "08:00", on the track's clock. */
  time: string;
  /** How long it lasts, in minutes. */
  minutes: number;
}

export interface WeekendPlan {
  /** The first day as "2026-11-20", or null for "always starting tomorrow". */
  start: string | null;
  sessions: SessionPlan[];
}

/** A named list of sessions that can be applied to any track. */
export interface WeekendType {
  id: string;
  name: string;
  sessions: SessionPlan[];
}

export const DEFAULT_SESSIONS: readonly SessionPlan[] = [
  { name: "FP1", day: 0, time: "08:00", minutes: 60 },
  { name: "FP2", day: 0, time: "14:00", minutes: 60 },
  { name: "FP3", day: 1, time: "08:00", minutes: 60 },
  { name: "Qualifying", day: 1, time: "14:00", minutes: 60 },
  { name: "Race", day: 2, time: "13:00", minutes: 120 },
];

/** The type that comes with the app. It cannot be edited or deleted. */
export const STANDARD_TYPE: WeekendType = {
  id: "standard",
  name: "Standard weekend",
  sessions: DEFAULT_SESSIONS.map((session) => ({ ...session })),
};

export const DEFAULT_PLAN: WeekendPlan = {
  start: null,
  sessions: DEFAULT_SESSIONS.map((session) => ({ ...session })),
};

/** The weekend of a track that has none of its own: the default type's sessions. */
export function planFromType(type: WeekendType): WeekendPlan {
  return {
    start: null,
    sessions: type.sessions.map((session) => ({ ...session })),
  };
}

export interface Session {
  name: string;
  start: number;
  end: number;
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

/** The first day of the weekend as "2026-11-20": the plan's date, or tomorrow at the track. */
export function weekendFirstDay(
  now: number,
  plan: WeekendPlan,
  zone: string,
): string {
  if (plan.start !== null && parseDay(plan.start) !== null) return plan.start;
  return addDays(localDay(now, zone), 1);
}

/** The first day of the weekend at 00:00 on the track's clock. */
export function weekendStart(
  now: number = Date.now(),
  plan: WeekendPlan = DEFAULT_PLAN,
  zone = "UTC",
): number {
  return zonedTime(weekendFirstDay(now, plan, zone), 0, zone);
}

/** 00:00 after the weekend's last day, on the track's clock. */
export function weekendEnd(
  now: number = Date.now(),
  plan: WeekendPlan = DEFAULT_PLAN,
  zone = "UTC",
): number {
  return zonedTime(
    addDays(weekendFirstDay(now, plan, zone), WEEKEND_DAYS),
    0,
    zone,
  );
}

function minutesOf(time: string): number {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** The sessions of a weekend with their start and end, earliest first. */
export function sessionTimes(
  now: number = Date.now(),
  plan: WeekendPlan = DEFAULT_PLAN,
  zone = "UTC",
): Session[] {
  const first = weekendFirstDay(now, plan, zone);
  return plan.sessions
    .map((session) => {
      const start = zonedTime(
        addDays(first, session.day),
        minutesOf(session.time),
        zone,
      );
      return {
        name: session.name,
        start,
        end: start + session.minutes * 60_000,
      };
    })
    .sort((a, b) => a.start - b.start);
}

/** A check that failed, with a message to show next to the form. */
export class PlanInputError extends Error {
  /** The row at fault, or null for the date or the whole form. */
  readonly row: number | null;
  constructor(row: number | null, message: string) {
    super(message);
    this.name = "PlanInputError";
    this.row = row;
  }
}

export interface SessionInput {
  name: string;
  day: number;
  time: string;
  /** Missing in weekends saved before sessions had a length. */
  minutes?: number;
}

/** Check a list of sessions, as typed or as saved. */
export function checkSessions(
  sessions: readonly SessionInput[],
): SessionPlan[] {
  if (sessions.length === 0)
    throw new PlanInputError(null, "Add at least one session.");
  if (sessions.length > MAX_SESSIONS)
    throw new PlanInputError(
      null,
      `A weekend has at most ${MAX_SESSIONS} sessions.`,
    );
  const names = new Set<string>();
  return sessions.map((session, row) => {
    const name = String(session.name ?? "").trim();
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
    if (typeof session.time !== "string" || !TIME.test(session.time))
      throw new PlanInputError(row, `${name} needs a time, for example 14:00.`);
    const minutes = session.minutes ?? DEFAULT_MINUTES;
    if (
      !Number.isInteger(minutes) ||
      minutes < MIN_MINUTES ||
      minutes > MAX_MINUTES
    )
      throw new PlanInputError(
        row,
        `${name} must last between ${MIN_MINUTES} minutes and 24 hours.`,
      );
    return { name, day: session.day, time: session.time, minutes };
  });
}

/** Check an edited weekend before saving it. An empty date means "from tomorrow". */
export function checkPlan(
  startText: string,
  sessions: readonly SessionInput[],
): WeekendPlan {
  const start = startText.trim();
  if (start !== "" && parseDay(start) === null)
    throw new PlanInputError(null, "The first day must be a date.");
  return {
    start: start === "" ? null : start,
    sessions: checkSessions(sessions),
  };
}

/** A saved value as a usable weekend, or null. Old weekends get a session length. */
export function readPlan(value: unknown): WeekendPlan | null {
  const plan = value as WeekendPlan | null;
  if (typeof plan !== "object" || plan === null) return null;
  if (!Array.isArray(plan.sessions)) return null;
  try {
    return checkPlan(plan.start ?? "", plan.sessions);
  } catch {
    return null;
  }
}

export const MAX_TYPE_NAME_LENGTH = 30;

/** Check the name of a weekend type; `types` are the ones that exist. */
export function checkTypeName(
  name: string,
  types: readonly WeekendType[],
  editingId?: string,
): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw new PlanInputError(null, "Give the weekend type a name.");
  if (trimmed.length > MAX_TYPE_NAME_LENGTH)
    throw new PlanInputError(
      null,
      `A weekend type name has at most ${MAX_TYPE_NAME_LENGTH} characters.`,
    );
  if (
    types.some(
      (type) =>
        type.id !== editingId &&
        type.name.toLowerCase() === trimmed.toLowerCase(),
    )
  )
    throw new PlanInputError(
      null,
      `There is already a weekend type called ${trimmed}.`,
    );
  return trimmed;
}

/** A saved value as a weekend type, or null. */
export function readType(value: unknown): WeekendType | null {
  const type = value as WeekendType | null;
  if (typeof type !== "object" || type === null) return null;
  if (typeof type.id !== "string" || type.id === "" || type.id === "standard")
    return null;
  if (typeof type.name !== "string" || type.name.trim() === "") return null;
  if (!Array.isArray(type.sessions)) return null;
  try {
    return {
      id: type.id,
      name: type.name.trim().slice(0, MAX_TYPE_NAME_LENGTH),
      sessions: checkSessions(type.sessions),
    };
  } catch {
    return null;
  }
}

export function sameSessions(
  a: readonly SessionPlan[],
  b: readonly SessionPlan[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (session, i) =>
        session.name === b[i].name &&
        session.day === b[i].day &&
        session.time === b[i].time &&
        session.minutes === b[i].minutes,
    )
  );
}

/** The type whose sessions are exactly these, if there is one. */
export function matchingType(
  sessions: readonly SessionPlan[],
  types: readonly WeekendType[],
): WeekendType | null {
  return types.find((type) => sameSessions(type.sessions, sessions)) ?? null;
}

/** "45 min", "1 h" or "1 h 30". */
export function formatLength(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
}
