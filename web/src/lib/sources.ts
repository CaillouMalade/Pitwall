// Every forecast source the app can show, and the forecasting centre behind it.
// Sources from the same centre are merged before anything is combined, so a
// centre with several feeds still counts once. See docs/METHOD.md.

export type ProviderId =
  | "open-meteo"
  | "met-norway"
  | "bright-sky"
  | "nws"
  | "smhi"
  | "fmi"
  | "dmi"
  | "geosphere";

export interface Source {
  id: string;
  label: string;
  /** The service the app calls to get it. */
  provider: ProviderId;
  /** The centre that runs the forecast. */
  centre: string;
}

const source = (
  id: string,
  label: string,
  provider: ProviderId,
  centre: string,
): Source => ({ id, label, provider, centre });

export const SOURCES: readonly Source[] = [
  source("ecmwf-ifs", "ECMWF IFS", "open-meteo", "ECMWF"),
  source("ecmwf-aifs", "ECMWF AIFS", "open-meteo", "ECMWF"),
  source("met-norway", "MET Norway", "met-norway", "ECMWF"),
  source("noaa-gfs", "NOAA GFS", "open-meteo", "NOAA"),
  source("nws", "US National Weather Service", "nws", "NOAA"),
  source("dwd-icon", "DWD ICON", "open-meteo", "DWD"),
  source("dwd-mosmix", "DWD MOSMIX", "bright-sky", "DWD"),
  source("meteofrance", "Météo-France", "open-meteo", "Météo-France"),
  source("ukmo", "UK Met Office", "open-meteo", "Met Office"),
  source("eccc-gem", "Canada GEM", "open-meteo", "ECCC"),
  source("jma", "JMA", "open-meteo", "JMA"),
  source("cma-grapes", "CMA GRAPES", "open-meteo", "CMA"),
  source("knmi-harmonie", "KNMI Harmonie", "open-meteo", "KNMI"),
  source("dmi-harmonie", "DMI Harmonie", "dmi", "DMI"),
  source("meteoswiss-icon", "MeteoSwiss ICON", "open-meteo", "MeteoSwiss"),
  source("italiameteo-icon", "ItaliaMeteo ICON", "open-meteo", "ItaliaMeteo"),
  source("geosphere", "GeoSphere Austria", "geosphere", "GeoSphere Austria"),
  source("smhi", "SMHI", "smhi", "MetCoOp"),
  source("fmi-harmonie", "FMI Harmonie", "fmi", "MetCoOp"),
];

const BY_ID = new Map(SOURCES.map((item) => [item.id, item]));

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "open-meteo": "Open-Meteo",
  "met-norway": "MET Norway",
  "bright-sky": "Bright Sky",
  nws: "US National Weather Service",
  smhi: "SMHI",
  fmi: "FMI",
  dmi: "DMI",
  geosphere: "GeoSphere Austria",
};

/**
 * Off until the user turns it on. GeoSphere Austria's adapter follows the
 * service's documentation, but its data address was failing while the adapter
 * was written, so it has not been checked against a live answer.
 */
export const PROVIDERS_OFF_BY_DEFAULT: readonly ProviderId[] = ["geosphere"];

export function sourceLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function sourceProvider(id: string): ProviderId | null {
  return BY_ID.get(id)?.provider ?? null;
}

/**
 * Roughly the area of the Nordic MetCoOp model. Inside it MET Norway serves that
 * model; everywhere else its forecast is built on ECMWF's.
 */
const NORDIC = { south: 53, west: 0, north: 73, east: 35 };

export interface Place {
  latitude: number;
  longitude: number;
}

export function inNordicArea(place: Place): boolean {
  return (
    place.latitude >= NORDIC.south &&
    place.latitude <= NORDIC.north &&
    place.longitude >= NORDIC.west &&
    place.longitude <= NORDIC.east
  );
}

/** The centre a source counts under at a place; an unknown source is its own centre. */
export function centreOf(id: string, place?: Place): string {
  if (id === "met-norway" && place && inNordicArea(place)) return "MetCoOp";
  return BY_ID.get(id)?.centre ?? id;
}
