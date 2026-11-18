# Weather, mapping and data terms

Pitwall's MIT licence covers its original application code and documentation. It does not replace the licences or service conditions for dependencies or external data.

This page is the list of credits. What each service's terms allow, with links to the pages that were read, is in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

The desktop build also bundles Electron and Chromium/Node. Their distributed `ELECTRON_LICENSE.txt` and `CHROMIUM_LICENSES.html` notices are retained in the app bundle alongside web dependency notices. Packaging tools are development dependencies, not shipped application dependencies.

## Forecasts

- **Open-Meteo:** weather data by [Open-Meteo.com](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Through it Pitwall shows models of ECMWF, NOAA, Deutscher Wetterdienst, Météo-France, the UK Met Office, Environment and Climate Change Canada, the Japan Meteorological Agency, the China Meteorological Administration, KNMI, MeteoSwiss and ItaliaMeteo. The free service is for non-commercial use within its quotas; see the [terms](https://open-meteo.com/en/terms).
- **MET Norway:** data from MET Norway, under [NLOD 2.0 and CC BY 4.0](https://api.met.no/doc/License). Its [terms of service](https://api.met.no/doc/TermsOfService) also apply.
- **Deutscher Wetterdienst:** MOSMIX forecast, source Deutscher Wetterdienst, under [CC BY 4.0](https://www.dwd.de/EN/service/legal_notice/legal_notice.html), served by [Bright Sky](https://brightsky.dev/).
- **US National Weather Service:** forecast data from the [National Weather Service](https://www.weather.gov/documentation/services-web-api), in the public domain. Pitwall is not endorsed by or affiliated with NOAA or the NWS.
- **SMHI:** source SMHI, under [CC BY 4.0 SE](https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning).
- **Finnish Meteorological Institute:** open data under [CC BY 4.0](https://en.ilmatieteenlaitos.fi/open-data-licence).
- **Danish Meteorological Institute:** open data under [CC BY 4.0](https://www.dmi.dk/friedata/dokumentation/terms-of-use).
- **GeoSphere Austria:** data under [CC BY 4.0](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/license.html).

Pitwall changes this data before showing it: it converts units, puts every source on the same hourly steps, keeps missing values missing, merges sources of the same forecasting centre and combines the centres. See [docs/METHOD.md](docs/METHOD.md).

## Past weather

- **Open-Meteo Historical Weather API:** ERA5, ERA5-Land and ECMWF IFS reanalysis, by [Open-Meteo.com](https://open-meteo.com/en/docs/historical-weather-api) under CC BY 4.0. Generated using Copernicus Climate Change Service information.
- **Bundled log:** `web/src/data/observed-weather.csv` holds the weather logged every 30 minutes at each track from 29 October to 13 November 2026 (time, track, temperature and the last hour's rain), shown when the archive cannot be reached. It was collected for the original racetrack weather project from OpenWeather's current-weather service. Weather data © [OpenWeather](https://openweathermap.org/), under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/); this file is offered under the same licence.

## Radar and mapping

- **RainViewer:** weather data by [RainViewer](https://www.rainviewer.com/), from its [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html). The credit stays on the map.
- **OpenStreetMap:** base tiles © OpenStreetMap contributors, data under [ODbL 1.0](https://www.openstreetmap.org/copyright). The [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies; Pitwall does not bulk-download or precache tiles.
- **Circuit outlines:** the racing lines in `web/src/data/track-outlines.json` are built from OpenStreetMap data, © OpenStreetMap contributors, under [ODbL 1.0](https://www.openstreetmap.org/copyright); that file is offered under the same licence. The outline of a track you add comes from the [Overpass API](https://overpass-api.de/), when you ask for it.
- **Sentinel-2 cloudless:** [https://s2maps.eu](https://s2maps.eu) by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) for non-commercial use.

Track names are descriptive; Pitwall does not claim affiliation with circuits, championships, weather agencies or map providers.

## Software dependencies

Production dependency licences and copyright notices are retained in [THIRD_PARTY_NOTICES.txt](web/public/THIRD_PARTY_NOTICES.txt), generated from the locked dependencies by `npm run notices` and included in the build. The app's fonts, Space Grotesk and Inter, are bundled with it under the SIL Open Font License 1.1; their notices are in the same file. There is no external font or script CDN.
