// The React side of fetching: one forecast per track and the radar list, each kept
// for 10 minutes so switching pages or tracks does not call the services again.
// A result with a failed provider is not kept, so the next visit retries it.

import { useCallback, useEffect, useState } from "react";
import { fetchAllForecasts, type ForecastResult } from "./fetching.ts";
import { userMessage } from "./http.ts";
import { parseObservations, type Observation } from "./history.ts";
import { defaultProviders, radarFrames } from "./providers.ts";
import type { RadarFrame, Track } from "./types.ts";

const TEN_MINUTES = 10 * 60_000;

interface Cached<T> {
  at: number;
  value: Promise<T>;
}

const forecastCache = new Map<string, Cached<ForecastResult>>();
let radarCache: Cached<RadarFrame[]> | null = null;

const trackKey = (track: Track) => `${track.latitude},${track.longitude}`;

function fresh<T>(entry: Cached<T> | null | undefined): entry is Cached<T> {
  return !!entry && Date.now() - entry.at < TEN_MINUTES;
}

export function loadForecast(
  track: Track,
): Promise<ForecastResult & { fetchedAt: number }> {
  const key = trackKey(track);
  const cached = forecastCache.get(key);
  if (!fresh(cached)) {
    const value = fetchAllForecasts(track, defaultProviders());
    const entry = { at: Date.now(), value };
    forecastCache.set(key, entry);
    void value.then((result) => {
      if (result.failures.length && forecastCache.get(key) === entry)
        forecastCache.delete(key);
    });
  }
  const entry = forecastCache.get(key)!;
  return entry.value.then((result) => ({ ...result, fetchedAt: entry.at }));
}

function loadRadar(): Promise<RadarFrame[]> {
  if (!fresh(radarCache)) {
    const entry = { at: Date.now(), value: radarFrames() };
    radarCache = entry;
    entry.value.catch(() => {
      if (radarCache === entry) radarCache = null;
    });
  }
  return radarCache!.value;
}

export type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "failed"; message: string };

export function useForecast(track: Track) {
  const [result, setResult] = useState<{
    key: string;
    data: Loadable<ForecastResult & { fetchedAt: number }>;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const key = trackKey(track);

  useEffect(() => {
    let active = true;
    loadForecast(track).then(
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
    // The track's coordinates are its identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const refresh = useCallback(() => {
    forecastCache.delete(key);
    setResult(null);
    setVersion((value) => value + 1);
  }, [key]);
  const data: Loadable<ForecastResult & { fetchedAt: number }> =
    result && result.key === key ? result.data : { state: "loading" };
  return { data, refresh };
}

export function useRadar(): Loadable<RadarFrame[]> {
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
  }, []);
  return data;
}

let observations: Promise<Observation[]> | null = null;

/** The bundled logged observations, loaded the first time a history page opens. */
export function useObservations(): Loadable<Observation[]> {
  const [data, setData] = useState<Loadable<Observation[]>>({
    state: "loading",
  });
  useEffect(() => {
    let active = true;
    observations ??= import("../data/observed-weather.csv?raw").then((module) =>
      parseObservations(module.default),
    );
    observations.then(
      (value) => active && setData({ state: "ready", value }),
      () => {
        observations = null;
        if (active)
          setData({
            state: "failed",
            message: "The logged history could not be loaded.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return data;
}
