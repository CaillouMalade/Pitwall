// What the app keeps on this device: the tracks a user added and a few preferences.
// Every access is guarded, so a blocked or full storage never stops the app.

import type { Track } from "./types.ts";

export const USER_TRACKS_KEY = "pitwall-tracks";
export const THEME_KEY = "pitwall-theme";
export const SELECTED_TRACK_KEY = "pitwall-track";

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

function isTrack(value: unknown): value is Track {
  const track = value as Track;
  return (
    typeof track === "object" &&
    track !== null &&
    typeof track.id === "string" &&
    typeof track.name === "string" &&
    typeof track.country === "string" &&
    Number.isFinite(track.latitude) &&
    Number.isFinite(track.longitude)
  );
}

/** The tracks a user added, or an empty list when none were saved or the data is unreadable. */
export function loadUserTracks(store = defaultStore()): Track[] {
  const text = readText(USER_TRACKS_KEY, store);
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter(isTrack) : [];
  } catch {
    return [];
  }
}

export const SAVE_FAILED_MESSAGE =
  "Could not save the track on this device. Check that site storage is allowed.";

/** Add one accepted track; throws with a user-facing message when it can't be saved. */
export function appendUserTrack(track: Track, store = defaultStore()): Track[] {
  const tracks = [...loadUserTracks(store), track];
  if (!writeText(USER_TRACKS_KEY, JSON.stringify(tracks), store))
    throw new Error(SAVE_FAILED_MESSAGE);
  return tracks;
}
