// Who the data comes from, for the About screen. The terms behind each line
// are in docs/DATA_SOURCES.md.

import type { ProviderId } from "./sources.ts";

export interface Credit {
  name: string;
  url: string;
  /** What it provides and under which licence. */
  detail: string;
}

/** Where each forecast service reaches, for the settings. */
export const PROVIDER_AREAS: Record<ProviderId, string> = {
  "open-meteo": "Worldwide, 12 national models",
  "met-norway": "Worldwide",
  "bright-sky": "Near a DWD forecast station",
  nws: "United States",
  smhi: "Nordic countries",
  fmi: "Northern Europe",
  dmi: "North-west Europe",
  geosphere: "Alps and central Europe",
};

export const CREDITS: readonly Credit[] = [
  {
    name: "Open-Meteo",
    url: "https://open-meteo.com/",
    detail:
      "Weather models of ECMWF, NOAA, DWD, Météo-France, UK Met Office, ECCC, JMA, CMA, KNMI, MeteoSwiss and ItaliaMeteo, and the ERA5 history. CC BY 4.0",
  },
  {
    name: "MET Norway",
    url: "https://api.met.no/",
    detail: "Data from MET Norway. CC BY 4.0",
  },
  {
    name: "Deutscher Wetterdienst",
    url: "https://www.dwd.de/",
    detail: "MOSMIX forecast through Bright Sky. CC BY 4.0",
  },
  {
    name: "US National Weather Service",
    url: "https://www.weather.gov/",
    detail: "Gridded forecast. Public domain",
  },
  {
    name: "SMHI",
    url: "https://www.smhi.se/",
    detail: "Point forecast. CC BY 4.0",
  },
  {
    name: "Finnish Meteorological Institute",
    url: "https://en.ilmatieteenlaitos.fi/open-data",
    detail: "Harmonie forecast. CC BY 4.0",
  },
  {
    name: "Danish Meteorological Institute",
    url: "https://www.dmi.dk/friedata",
    detail: "Harmonie forecast. CC BY 4.0",
  },
  {
    name: "GeoSphere Austria",
    url: "https://data.hub.geosphere.at/",
    detail: "Numerical weather prediction. CC BY 4.0",
  },
  {
    name: "RainViewer",
    url: "https://www.rainviewer.com/",
    detail: "Rain radar",
  },
  {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    detail: "Maps and circuit outlines © OpenStreetMap contributors. ODbL",
  },
  {
    name: "Sentinel-2 cloudless by EOX",
    url: "https://s2maps.eu/",
    detail:
      "Satellite imagery by EOX IT Services GmbH, contains modified Copernicus Sentinel data 2024. CC BY-NC-SA 4.0",
  },
  {
    name: "OpenWeather",
    url: "https://openweathermap.org/",
    detail: "Bundled observation log, weather data © OpenWeather. ODbL",
  },
];

export const REPOSITORY = "https://github.com/Arthur-Brht/pitwall";
