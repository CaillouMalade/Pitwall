// The React side of fetching. Each forecast, radar list and history is kept for a
// while, so switching pages or tracks does not call the services again; on top of
// that the browser's own HTTP cache follows each service's Expires header. A
// forecast with a failed service is not kept, so the next visit retries it.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllForecasts, type ForecastResult } from "./fetching.ts";
import { fetchHistory } from "./history-source.ts";
import {
  MIN_DAYS,
  observedDays,
  parseObservations,
  type Observation,
  type TrackHistory,
} from "./history.ts";
import { ServiceError, userMessage } from "./http.ts";
import {
  defaultProviders,
  radarFrames,
  type ForecastProvider,
} from "./providers/index.ts";
import { useSettings } from "./settings.tsx";
import type { ProviderId } from "./sources.ts";
import { loadSnapshot, saveSnapshot } from "./storage.ts";
import type { ForecastPoint, RadarFrame, Track } from "./types.ts";
import { keepForecastRange } from "./windows.ts";

const MINUTE = 60_000;
export const FORECAST_TTL = 10 * MINUTE;
const FAILED_TTL = MINUTE;
const HISTORY_TTL = 6 * 60 * MINUTE;
/** A history that fell back to the bundled log is tried again soon. */
const FALLBACK_TTL = 2 * MINUTE;

interface Cached<T> {
  at: number;
  ttl: number;
  value: Promise<T>;
}

function fresh<T>(entry: Cached<T> | null | undefined): entry is Cached<T> {
  return !!entry && Date.now() - entry.at < entry.ttl;
}

export type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "failed"; message: string };

// Forecasts

export interface ForecastData extends ForecastResult {
  fetchedAt: number;
  /**
   * True when no service could be reached and the points are the last forecast
   * kept on this device; fetchedAt is then when that one was fetched.
   */
  saved: boolean;
}

const placeKey = (track: Track) => `${track.latitude},${track.longitude}`;

// Each service's answer for a place is kept on its own: a good answer for 10
// minutes, a failure for one, so a service that is down is neither asked on
// every click nor allowed to make the others be asked again.
const answers = new Map<string, Cached<ForecastPoint[]>>();

function remembering(provider: ForecastProvider, place: string) {
  const key = `${provider.id}|${place}`;
  return {
    ...provider,
    forecast(location: Track, now: number) {
      const kept = answers.get(key);
      if (fresh(kept)) return kept.value;
      const entry: Cached<ForecastPoint[]> = {
        at: Date.now(),
        ttl: FORECAST_TTL,
        value: provider.forecast(location, now),
      };
      answers.set(key, entry);
      entry.value.catch((error: unknown) => {
        // "Nothing for this place" stays true; a real failure is retried soon.
        if (!(error instanceof ServiceError && error.kind === "no-coverage"))
          entry.ttl = FAILED_TTL;
      });
      return entry.value;
    },
  };
}

async function fetchForecast(
  track: Track,
  off: readonly ProviderId[],
): Promise<ForecastData> {
  const place = placeKey(track);
  const providers = defaultProviders()
    .filter((provider) => !off.includes(provider.id))
    .map((provider) => remembering(provider, place));
  const result = await fetchAllForecasts(track, providers, Date.now());
  // "Updated" is when the newest answer on screen was fetched.
  const fetchedAt = Math.max(
    0,
    ...result.statuses
      .filter((status) => status.state === "answered")
      .map((status) => answers.get(`${status.id}|${place}`)?.at ?? 0),
  );
  if (result.points.length > 0) {
    saveSnapshot(place, { at: fetchedAt, points: result.points });
    return { ...result, fetchedAt, saved: false };
  }
  // Nothing came back: show the last forecast of this place, if it still reaches ahead.
  const snapshot = result.failures.length ? loadSnapshot(place) : null;
  const points = snapshot ? keepForecastRange(snapshot.points, Date.now()) : [];
  if (snapshot && points.length > 0)
    return { ...result, points, fetchedAt: snapshot.at, saved: true };
  return { ...result, fetchedAt: Date.now(), saved: false };
}

// The assembled forecast of a place, so a page that opens again shows it at once.
const forecasts = new Map<
  string,
  Cached<ForecastData> & { result?: ForecastData }
>();

const forecastKey = (track: Track, off: readonly ProviderId[]) =>
  `${placeKey(track)}|${off.join(",")}`;

export function loadForecast(
  track: Track,
  off: readonly ProviderId[] = [],
): Promise<ForecastData> {
  const key = forecastKey(track, off);
  if (!fresh(forecasts.get(key))) {
    const entry: Cached<ForecastData> & { result?: ForecastData } = {
      at: Date.now(),
      ttl: FORECAST_TTL,
      value: fetchForecast(track, off),
    };
    forecasts.set(key, entry);
    entry.value.then(
      (result) => {
        entry.result = result;
        if (result.failures.length) entry.ttl = FAILED_TTL;
      },
      () => {
        if (forecasts.get(key) === entry) forecasts.delete(key);
      },
    );
  }
  return forecasts.get(key)!.value;
}

/** Forget what is kept for a place, so the next load asks every service again. */
function forgetForecast(track: Track, off: readonly ProviderId[]) {
  forecasts.delete(forecastKey(track, off));
  const place = placeKey(track);
  for (const key of answers.keys())
    if (key.endsWith(`|${place}`)) answers.delete(key);
}

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function useForecast(track: Track) {
  const { providersOff } = useSettings();
  const online = useOnline();
  const key = forecastKey(track, providersOff);
  const [result, setResult] = useState<{
    key: string;
    data: Loadable<ForecastData>;
  } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loadForecast(track, providersOff).then(
      (value) => active && setResult({ key, data: { state: "ready", value } }),
      (error) =>
        active &&
        setResult({
          key,
          data: { state: "failed", message: userMessage(error) },
        }),
    );
    return () => {
      active = false;
    };
    // The place and the chosen services are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const refresh = useCallback(() => {
    forgetForecast(track, providersOff);
    setResult(null);
    setVersion((value) => value + 1);
    // The place and the chosen services are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // What is kept for this place shows at once, without a loading state.
  const kept = forecasts.get(key);
  const data: Loadable<ForecastData> =
    result && result.key === key
      ? result.data
      : fresh(kept) && kept.result
        ? { state: "ready", value: kept.result }
        : { state: "loading" };

  // Back online with nothing fresh on screen: fetch again without being asked.
  const stale =
    data.state === "failed" ||
    (data.state === "ready" &&
      (data.value.saved || data.value.points.length === 0));
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && stale) refresh();
    wasOnline.current = online;
  }, [online, stale, refresh]);

  return { data, refresh, online };
}

// Radar

let radarCache: Cached<RadarFrame[]> | null = null;

function loadRadar(): Promise<RadarFrame[]> {
  if (!fresh(radarCache)) {
    const entry: Cached<RadarFrame[]> = {
      at: Date.now(),
      ttl: FORECAST_TTL,
      value: radarFrames(),
    };
    radarCache = entry;
    entry.value.catch(() => {
      if (radarCache === entry) radarCache = null;
    });
  }
  return radarCache!.value;
}

export function useRadar(): Loadable<RadarFrame[]> {
  const online = useOnline();
  const [data, setData] = useState<Loadable<RadarFrame[]>>({
    state: "loading",
  });
  useEffect(() => {
    let active = true;
    loadRadar().then(
      (value) => active && setData({ state: "ready", value }),
      (error) =>
        active && setData({ state: "failed", message: userMessage(error) }),
    );
    return () => {
      active = false;
    };
  }, [online]);
  return data;
}

// History

let observations: Promise<Observation[]> | null = null;

/** The observations bundled with the app, loaded the first time they are needed. */
function loadObservations(): Promise<Observation[]> {
  observations ??= import("../data/observed-weather.csv?raw").then((module) =>
    parseObservations(module.default),
  );
  observations.catch(() => {
    observations = null;
  });
  return observations;
}

const historyCache = new Map<string, Cached<TrackHistory>>();

async function fetchTrackHistory(
  track: Track,
  days: number,
): Promise<TrackHistory> {
  try {
    return {
      trackId: track.id,
      origin: "archive",
      days: await fetchHistory(track, days),
    };
  } catch (error) {
    // The archive cannot be reached: fall back on the bundled log, when the
    // track is in it.
    const logged = await loadObservations()
      .then((rows) => observedDays(rows, track.id))
      .catch(() => []);
    if (logged.length < MIN_DAYS) throw error;
    return { trackId: track.id, origin: "bundled", days: logged };
  }
}

export function loadHistory(track: Track, days: number): Promise<TrackHistory> {
  const key = `${track.id}|${placeKey(track)}|${days}`;
  if (!fresh(historyCache.get(key))) {
    const entry: Cached<TrackHistory> = {
      at: Date.now(),
      ttl: HISTORY_TTL,
      value: fetchTrackHistory(track, days),
    };
    historyCache.set(key, entry);
    entry.value.then(
      (history) => {
        if (history.origin === "bundled") entry.ttl = FALLBACK_TTL;
      },
      () => {
        if (historyCache.get(key) === entry) historyCache.delete(key);
      },
    );
  }
  return historyCache.get(key)!.value;
}

/** The history of each given track, by track id. */
export function useHistories(
  tracks: readonly Track[],
  days: number,
): Record<string, Loadable<TrackHistory>> {
  const online = useOnline();
  const key = tracks
    .map((track) => `${track.id}|${placeKey(track)}`)
    .concat(String(days))
    .join(";");
  const [results, setResults] = useState<{
    key: string;
    data: Record<string, Loadable<TrackHistory>>;
  }>({ key, data: {} });

  useEffect(() => {
    let active = true;
    const set = (id: string, data: Loadable<TrackHistory>) => {
      if (!active) return;
      setResults((current) => ({
        key,
        data: { ...(current.key === key ? current.data : {}), [id]: data },
      }));
    };
    for (const track of tracks)
      loadHistory(track, days).then(
        (value) => set(track.id, { state: "ready", value }),
        (error) =>
          set(track.id, { state: "failed", message: userMessage(error) }),
      );
    return () => {
      active = false;
    };
    // The tracks' ids and places, and the period, are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);

  const current = results.key === key ? results.data : {};
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      current[track.id] ?? { state: "loading" },
    ]),
  );
}

export function useHistory(track: Track, days: number): Loadable<TrackHistory> {
  return useHistories([track], days)[track.id];
}
