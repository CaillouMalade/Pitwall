// The outline to draw for a track: the bundled loop of a built-in circuit, or
// the racetrack lines OpenStreetMap has near a track the user added. Those are
// only fetched when the user asks for them, once per track, and then kept: the
// public Overpass service is not meant to be called by an app on its own.

import { useCallback, useState, useSyncExternalStore } from "react";
import outlines from "../data/track-outlines.json";
import { userMessage } from "./http.ts";
import { fetchTrackLines, isLines } from "./outline-source.ts";
import type { LatLon, Outline } from "./outline.ts";
import { keep, loadKept, OUTLINES_KEY } from "./storage.ts";
import type { Track } from "./types.ts";

const BUILT_IN = outlines as unknown as Record<string, Outline>;

export interface TrackShape {
  /** The lap as one loop: only the built-in circuits have it. */
  outline: Outline | null;
  /** Every line to draw. */
  lines: readonly (readonly LatLon[])[];
}

export function builtInOutline(track: Track): Outline | null {
  return BUILT_IN[track.id] ?? null;
}

const placeName = (track: Track) => `${track.latitude},${track.longitude}`;

// What is kept on this device, read once and updated when a lookup finishes.
let kept: Record<string, LatLon[][]> | null = null;
const listeners = new Set<() => void>();

function keptLines(): Record<string, LatLon[][]> {
  kept ??= loadKept(OUTLINES_KEY, isLines);
  return kept;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remember(track: Track, lines: LatLon[][]) {
  keep(OUTLINES_KEY, placeName(track), lines, isLines, 12);
  kept = { ...keptLines(), [placeName(track)]: lines };
  for (const listener of listeners) listener();
}

/** The lines kept for an added track: undefined when it was never looked up. */
function useKeptLines(track: Track): LatLon[][] | undefined {
  const all = useSyncExternalStore(subscribe, keptLines, keptLines);
  return all[placeName(track)];
}

/** Null for a track with nothing to draw. */
export function useTrackShape(track: Track): TrackShape | null {
  const outline = builtInOutline(track);
  const lines = useKeptLines(track);
  if (outline) return { outline, lines: [[...outline.loop, outline.loop[0]]] };
  if (!lines || lines.length === 0) return null;
  return { outline: null, lines };
}

export type OutlineLookup =
  /** A built-in circuit, or an added track whose outline is kept. */
  | { state: "has" }
  /** Never looked up: `lookup` asks OpenStreetMap. */
  | { state: "none"; lookup: () => void }
  | { state: "loading" }
  /** Looked up: the map has no racetrack at this place. */
  | { state: "empty" }
  | { state: "failed"; message: string; lookup: () => void };

/** Where an added track's outline stands, and the way to ask for it. */
export function useOutlineLookup(track: Track): OutlineLookup {
  const lines = useKeptLines(track);
  const name = placeName(track);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{
    name: string;
    message: string;
  } | null>(null);
  const lookup = useCallback(() => {
    setBusy(name);
    setFailed(null);
    fetchTrackLines(track).then(
      (found) => {
        remember(track, found);
        setBusy(null);
      },
      (error: unknown) => {
        setFailed({ name, message: userMessage(error) });
        setBusy(null);
      },
    );
    // The place is the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  if (builtInOutline(track) || (lines && lines.length > 0))
    return { state: "has" };
  if (busy === name) return { state: "loading" };
  if (lines) return { state: "empty" };
  if (failed?.name === name)
    return { state: "failed", message: failed.message, lookup };
  return { state: "none", lookup };
}
