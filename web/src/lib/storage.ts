// What the app keeps on this device: the tracks a user added, each track's
// weekend, a few preferences and the last forecast of the tracks last opened.
// Every access is guarded, so a blocked or full storage never stops the app.

import {
  MAX_TYPES,
  readPlan,
  readType,
  STANDARD_TYPE,
  type WeekendPlan,
  type WeekendType,
} from "./sessions.ts";
import {
  PROVIDER_LABELS,
  PROVIDERS_OFF_BY_DEFAULT,
  type ProviderId,
} from "./sources.ts";
import type { ForecastPoint, Track } from "./types.ts";
import { isUnits, type Units } from "./units.ts";

export const USER_TRACKS_KEY = "pitwall-tracks";
export const THEME_KEY = "pitwall-theme";
export const SELECTED_TRACK_KEY = "pitwall-track";
export const UNITS_KEY = "pitwall-units";
export const WEEKENDS_KEY = "pitwall-weekends";
export const PROVIDERS_OFF_KEY = "pitwall-sources-off";
export const WELCOMED_KEY = "pitwall-welcomed";
export const SNAPSHOTS_KEY = "pitwall-forecasts";
export const WEEKEND_TYPES_KEY = "pitwall-weekend-types";
export const TRACKS_COLLAPSED_KEY = "pitwall-tracks-collapsed";
export const OUTLINES_KEY = "pitwall-outlines";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readText(key: string, store = defaultStore()): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeText(
  key: string,
  value: string,
  store = defaultStore(),
): boolean {
  try {
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** A saved JSON value, or null when there is none or it cannot be read. */
function readJson(key: string, store: KeyValueStore | null): unknown {
  const text = readText(key, store);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isTrack(value: unknown): value is Track {
  const track = value as Track;
  return (
    typeof track === "object" &&
    track !== null &&
    typeof track.id === "string" &&
    track.id !== "" &&
    typeof track.name === "string" &&
    typeof track.country === "string" &&
    Number.isFinite(track.latitude) &&
    Math.abs(track.latitude) <= 90 &&
    Number.isFinite(track.longitude) &&
    Math.abs(track.longitude) <= 180 &&
    (track.timezone === undefined || typeof track.timezone === "string")
  );
}

/** The tracks a user added, or an empty list when none were saved or the data is unreadable. */
export function loadUserTracks(store = defaultStore()): Track[] {
  const value = readJson(USER_TRACKS_KEY, store);
  return Array.isArray(value) ? value.filter(isTrack) : [];
}

export const SAVE_FAILED_MESSAGE =
  "Could not save on this device. Check that storage is allowed.";

/** Replace the user's tracks; throws with a user-facing message when it can't be saved. */
export function saveUserTracks(
  tracks: readonly Track[],
  store = defaultStore(),
): Track[] {
  if (!writeText(USER_TRACKS_KEY, JSON.stringify(tracks), store))
    throw new Error(SAVE_FAILED_MESSAGE);
  return [...tracks];
}

/** Each track's own weekend, by track id. Tracks without one use the default. */
export function loadPlans(store = defaultStore()): Record<string, WeekendPlan> {
  const value = readJson(WEEKENDS_KEY, store);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  const plans: Record<string, WeekendPlan> = {};
  for (const [id, saved] of Object.entries(value)) {
    const plan = readPlan(saved);
    if (plan) plans[id] = plan;
  }
  return plans;
}

/** Save one track's weekend, or with null go back to the default. */
export function savePlan(
  trackId: string,
  plan: WeekendPlan | null,
  store = defaultStore(),
): Record<string, WeekendPlan> {
  const plans = loadPlans(store);
  if (plan === null) delete plans[trackId];
  else plans[trackId] = plan;
  if (!writeText(WEEKENDS_KEY, JSON.stringify(plans), store))
    throw new Error(SAVE_FAILED_MESSAGE);
  return plans;
}

export function loadUnits(fallback: Units, store = defaultStore()): Units {
  const value = readJson(UNITS_KEY, store);
  return isUnits(value) ? value : fallback;
}

export function saveUnits(units: Units, store = defaultStore()): boolean {
  return writeText(UNITS_KEY, JSON.stringify(units), store);
}

/** The services that are off: the user's choice, or the default when none was made. */
export function loadProvidersOff(store = defaultStore()): ProviderId[] {
  const value = readJson(PROVIDERS_OFF_KEY, store);
  return Array.isArray(value)
    ? value.filter(
        (id): id is ProviderId =>
          typeof id === "string" && id in PROVIDER_LABELS,
      )
    : [...PROVIDERS_OFF_BY_DEFAULT];
}

export function saveProvidersOff(
  ids: readonly ProviderId[],
  store = defaultStore(),
): boolean {
  return writeText(PROVIDERS_OFF_KEY, JSON.stringify(ids), store);
}

// The last forecast of a few places, shown when the services cannot be reached.

export interface Snapshot {
  at: number;
  points: ForecastPoint[];
}

export const MAX_SNAPSHOTS = 6;

function loadSnapshots(store: KeyValueStore | null): Record<string, Snapshot> {
  const value = readJson(SNAPSHOTS_KEY, store);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Snapshot] =>
        typeof (entry[1] as Snapshot)?.at === "number" &&
        Array.isArray((entry[1] as Snapshot)?.points),
    ),
  );
}

export function loadSnapshot(
  place: string,
  store = defaultStore(),
): Snapshot | null {
  return loadSnapshots(store)[place] ?? null;
}

/** Keep a place's forecast, and only the most recent few places. */
export function saveSnapshot(
  place: string,
  snapshot: Snapshot,
  store = defaultStore(),
): boolean {
  const all = { ...loadSnapshots(store), [place]: snapshot };
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_SNAPSHOTS);
  return writeText(
    SNAPSHOTS_KEY,
    JSON.stringify(Object.fromEntries(kept)),
    store,
  );
}

// Weekend types: named lists of sessions, and which one new tracks start with.

export interface WeekendTypes {
  /** The standard type first, then the user's own. */
  types: WeekendType[];
  defaultId: string;
}

export function loadWeekendTypes(store = defaultStore()): WeekendTypes {
  const value = readJson(WEEKEND_TYPES_KEY, store) as {
    types?: unknown;
    defaultId?: unknown;
  } | null;
  const own: WeekendType[] = [];
  if (value && Array.isArray(value.types))
    for (const item of value.types.slice(0, MAX_TYPES)) {
      const type = readType(item);
      if (type && !own.some((other) => other.id === type.id)) own.push(type);
    }
  const types = [STANDARD_TYPE, ...own];
  const defaultId = types.some((type) => type.id === value?.defaultId)
    ? (value!.defaultId as string)
    : STANDARD_TYPE.id;
  return { types, defaultId };
}

/** Save the user's own types and the default; throws when it can't be saved. */
export function saveWeekendTypes(
  next: WeekendTypes,
  store = defaultStore(),
): WeekendTypes {
  const own = next.types.filter((type) => type.id !== STANDARD_TYPE.id);
  const defaultId = next.types.some((type) => type.id === next.defaultId)
    ? next.defaultId
    : STANDARD_TYPE.id;
  if (
    !writeText(
      WEEKEND_TYPES_KEY,
      JSON.stringify({ types: own, defaultId }),
      store,
    )
  )
    throw new Error(SAVE_FAILED_MESSAGE);
  return { types: [STANDARD_TYPE, ...own], defaultId };
}

// Small things kept between visits, each under its own name.

export function loadKept<T>(
  key: string,
  check: (value: unknown) => value is T,
  store = defaultStore(),
): Record<string, T> {
  const value = readJson(key, store);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, T] =>
      check(entry[1]),
    ),
  );
}

/** Keep one more entry, dropping the oldest when there are more than `max`. */
export function keep<T>(
  key: string,
  name: string,
  value: T,
  check: (value: unknown) => value is T,
  max: number,
  store = defaultStore(),
): boolean {
  const all = loadKept(key, check, store);
  delete all[name];
  const entries = [...Object.entries(all), [name, value] as [string, T]].slice(
    -max,
  );
  return writeText(key, JSON.stringify(Object.fromEntries(entries)), store);
}
