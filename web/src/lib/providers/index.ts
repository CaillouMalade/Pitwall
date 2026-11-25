// The forecast services. Each adapter turns its service's answer into
// ForecastPoints on the same 3-hour UTC windows.

import type { FetchLike } from "../http.ts";
import { isNativeApp } from "../native.ts";
import type { ProviderId } from "../sources.ts";
import type { ForecastPoint } from "../types.ts";
import { brightSky } from "./bright-sky.ts";
import { dmi } from "./dmi.ts";
import { fmi } from "./fmi.ts";
import { geosphere } from "./geosphere.ts";
import { metNorway } from "./met-norway.ts";
import { nws } from "./nws.ts";
import { openMeteo } from "./open-meteo.ts";
import type { Location } from "./read.ts";
import { smhi } from "./smhi.ts";

export interface ForecastProvider {
  id: ProviderId;
  /** The sources it can return. */
  sources: readonly string[];
  /** False for a place the service does not forecast; then it is not called. */
  covers?(location: Location): boolean;
  forecast(location: Location, now: number): Promise<ForecastPoint[]>;
}

export const PROVIDERS: Record<
  ProviderId,
  (fetchImpl?: FetchLike) => ForecastProvider
> = {
  "open-meteo": openMeteo,
  "met-norway": metNorway,
  "bright-sky": brightSky,
  nws,
  smhi,
  fmi,
  dmi,
  geosphere,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

// MET Norway's terms ask mobile apps not to call its API directly but through
// a server of their own, and Pitwall has none; see docs/DATA_SOURCES.md.
const NOT_IN_MOBILE_APPS: readonly ProviderId[] = ["met-norway"];

/** The services this build may call: all of them, except on a phone. */
export const AVAILABLE_PROVIDER_IDS = PROVIDER_IDS.filter(
  (id) => !(isNativeApp() && NOT_IN_MOBILE_APPS.includes(id)),
);

// One instance of each, so what an adapter remembers (the NWS grid cell of a
// place) lasts as long as the app is open.
let instances: ForecastProvider[] | null = null;

export function defaultProviders(): ForecastProvider[] {
  instances ??= AVAILABLE_PROVIDER_IDS.map((id) => PROVIDERS[id]());
  return instances;
}

export { brightSky, dmi, fmi, geosphere, metNorway, nws, openMeteo, smhi };
export { radarFrames } from "./radar.ts";
export { validateLocation, type Location } from "./read.ts";
