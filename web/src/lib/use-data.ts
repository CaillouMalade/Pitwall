// The React side of fetching. Each forecast, radar list and history is kept for a
// while, so switching pages or tracks does not call the services again; on top of
// that the browser's own HTTP cache follows each service's Expires header. A
// forecast with a failed service is not kept, so the next visit retries it.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllForecasts, type ForecastResult } from "./fetching.ts";
import {
  fetchHistory,
  fetchHours,
  fetchSameDates,
  type YearDays,
} from "./history-source.ts";
import {
  MIN_DAYS,
  observedDays,
  parseObservations,
  type HourlyWeather,
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
import { fetchRainGrid } from "./rain-map.ts";
import { keep, loadKept, loadSnapshot, saveSnapshot } from "./storage.ts";
import type { ForecastPoint, RadarFrame, Track } from "./types.ts";
import { keepForecastRange } from "./windows.ts";
import { trackZone } from "./zone.ts";

const MINUTE = 60_000;
export const FORECAST_TTL = 10 * MINUTE;
const FAILED_TTL = MINUTE;
const HISTORY_TTL = 6 * 60 * MINUTE;
/** A history that fell back to the bundled log is tried again soon. */
const FALLBACK_TTL = 2 * MINUTE;
const RAIN_GRID_TTL = 30 * MINUTE;
const SAME_DATES_KEY = "pitwall-same-dates";

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

// Anything else that is fetched: one loader, kept by key for a while.

const kept = new Map<string, Cached<unknown>>();

/** Load once per key and keep the answer for `ttl`; a failure is not kept. */
export function loadKeyed<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const existing = kept.get(key) as Cached<T> | undefined;
  if (fresh(existing)) return existing.value;
  const entry: Cached<T> = { at: Date.now(), ttl, value: load() };
  kept.set(key, entry as Cached<unknown>);
  entry.value.catch(() => {
    if (kept.get(key) === entry) kept.delete(key);
  });
  return entry.value;
}

/** The state of one keyed load; with a null key nothing is loaded. */
export function useKeyed<T>(
  key: string | null,
  ttl: number,
  load: () => Promise<T>,
): Loadable<T> & { retry: () => void } {
  const online = useOnline();
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: Loadable<T>;
  } | null>(null);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (key === null) return;
    let active = true;
    loadKeyed(key, ttl, () => loader.current()).then(
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
  }, [key, ttl, version, online]);

  const retry = useCallback(() => {
    if (key !== null) kept.delete(key);
    setResult(null);
    setVersion((value) => value + 1);
  }, [key]);

  const data: Loadable<T> =
    key !== null && result && result.key === key
      ? result.data
      : { state: "loading" };
  return { ...data, retry };
}

// The forecast rain map of a session

export function useRainGrid(
  track: Track,
  start: number,
  end: number,
  enabled: boolean,
) {
  return useKeyed(
    enabled ? `rain-grid|${placeKey(track)}|${start}|${end}` : null,
    RAIN_GRID_TTL,
    () => fetchRainGrid(track, start, end),
  );
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

async function fetchTrackHistory(
  track: Track,
  days: number,
): Promise<TrackHistory> {
  try {
    return {
      trackId: track.id,
      origin: "archive",
      days: await fetchHistory(
        track,
        days,
        Date.now(),
        undefined,
        trackZone(track),
      ),
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

const historyKey = (track: Track) =>
  `${track.id}|${placeKey(track)}|${trackZone(track)}`;

export function loadHistory(track: Track, days: number): Promise<TrackHistory> {
  const key = `history|${historyKey(track)}|${days}`;
  const value = loadKeyed(key, HISTORY_TTL, () =>
    fetchTrackHistory(track, days),
  );
  value.then(
    (history) => {
      // A history that fell back to the bundled log is tried again soon.
      const entry = kept.get(key);
      if (history.origin === "bundled" && entry) entry.ttl = FALLBACK_TTL;
    },
    () => undefined,
  );
  return value;
}

/** One load per track, by track id. */
function useEach<T>(
  tracks: readonly Track[],
  suffix: string,
  load: (track: Track) => Promise<T>,
): Record<string, Loadable<T>> {
  const online = useOnline();
  const key = tracks.map(historyKey).concat(suffix).join(";");
  const [results, setResults] = useState<{
    key: string;
    data: Record<string, Loadable<T>>;
  }>({ key, data: {} });
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let active = true;
    const set = (id: string, data: Loadable<T>) => {
      if (!active) return;
      setResults((current) => ({
        key,
        data: { ...(current.key === key ? current.data : {}), [id]: data },
      }));
    };
    for (const track of tracks)
      loader.current(track).then(
        (value) => set(track.id, { state: "ready", value }),
        (error) =>
          set(track.id, { state: "failed", message: userMessage(error) }),
      );
    return () => {
      active = false;
    };
    // The tracks' ids, places and zones, and the suffix, are the identity here.
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

/** The last `days` days of each given track, by track id. */
export function useHistories(
  tracks: readonly Track[],
  days: number,
): Record<string, Loadable<TrackHistory>> {
  return useEach(tracks, `recent|${days}`, (track) => loadHistory(track, days));
}

export function useHistory(track: Track, days: number): Loadable<TrackHistory> {
  return useHistories([track], days)[track.id];
}

/** Every hour of a range of days at a track. Past days never change, so they are kept long. */
export function loadHours(
  track: Track,
  start: string,
  end: string,
): Promise<HourlyWeather[]> {
  return loadKeyed(
    `hours|${historyKey(track)}|${start}|${end}`,
    HISTORY_TTL,
    () => fetchHours(track, start, end, trackZone(track)),
  );
}

/** The hours of a range of days for each given track, by track id. */
export function useHours(
  tracks: readonly Track[],
  start: string,
  end: string,
): Record<string, Loadable<HourlyWeather[]>> {
  return useEach(tracks, `hours|${start}|${end}`, (track) =>
    loadHours(track, start, end),
  );
}

const isYears = (value: unknown): value is YearDays[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof (item as YearDays)?.year === "number" &&
      Array.isArray((item as YearDays)?.days),
  );

/**
 * The same dates in earlier years. Whole years that are over never change, so
 * the answer is also kept on this device and shown again without a connection.
 */
export function loadSameDates(
  track: Track,
  monthDay: string,
  length: number,
  years: readonly number[],
): Promise<YearDays[]> {
  const name = `${placeKey(track)}|${trackZone(track)}|${monthDay}|${length}|${years[0]}-${years.at(-1)}`;
  return loadKeyed(`same-dates|${name}`, HISTORY_TTL, async () => {
    const saved = loadKept(SAME_DATES_KEY, isYears)[name];
    if (saved && saved.length >= years.length - 1) return saved;
    const found = await fetchSameDates(
      track,
      monthDay,
      length,
      years,
      trackZone(track),
    ).catch((error: unknown) => {
      if (saved?.length) return saved;
      throw error;
    });
    keep(SAME_DATES_KEY, name, found, isYears, 8);
    return found;
  });
}

export function useSameDates(
  track: Track,
  monthDay: string,
  length: number,
  years: readonly number[],
) {
  return useKeyed(
    `same-dates-view|${placeKey(track)}|${trackZone(track)}|${monthDay}|${length}|${years[0]}-${years.at(-1)}`,
    HISTORY_TTL,
    () => loadSameDates(track, monthDay, length, years),
  );
}
