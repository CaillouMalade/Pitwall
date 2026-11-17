# Weather, mapping and data terms

Pitwall's MIT licence covers its original application code and documentation. It does not replace the licences or service conditions for dependencies or external data.

The desktop build also bundles Electron and Chromium/Node. Their distributed `ELECTRON_LICENSE.txt` and `CHROMIUM_LICENSES.html` notices are retained in the app bundle alongside web dependency notices. Packaging tools are development dependencies, not shipped application dependencies.

## Weather

- **Open-Meteo:** data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The free service is for non-commercial use within its quotas; see the [current terms](https://open-meteo.com/en/terms).
- **MET Norway:** data © Norwegian Meteorological Institute (MET Norway), under its [licensing and data policy](https://docs.api.met.no/doc/License.html) (CC BY 4.0 / NLOD 2.0). Its [terms of service](https://docs.api.met.no/doc/TermsOfService.html) also apply; the desktop app identifies itself to MET with a User-Agent.
- Pitwall converts units, sums hourly rain into 3-hour windows and keeps missing values missing.

## Logged weather

`web/src/data/observed-weather.csv` holds the weather logged every 30 minutes at each track from 29 October to 13 November 2026 (time, track, temperature and the last hour's rain), used by the History and Track comparison pages. It was collected for the original racetrack weather project from OpenWeatherMap's current-weather service; OpenWeatherMap data are under [CC BY-SA 4.0](https://openweathermap.org/full-price#licenses), and this file keeps that licence.

## Radar and mapping

- **RainViewer:** recent radar tiles from its [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html). RainViewer attribution stays on the map.
- **OpenStreetMap:** base tiles © OpenStreetMap contributors, under [ODbL 1.0](https://www.openstreetmap.org/copyright). The [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies; Pitwall does not bulk-download or precache tiles.
- **Esri World Imagery:** satellite tiles for the circuit view, © Esri and its data providers, shown with attribution under Esri's [terms of use](https://www.esri.com/en-us/legal/terms/full-master-agreement).

Track names are descriptive; Pitwall does not claim affiliation with circuits, championships, weather agencies or map providers.

## Software dependencies

Production dependency licences and copyright notices are retained in [THIRD_PARTY_NOTICES.txt](web/public/THIRD_PARTY_NOTICES.txt), generated from the locked dependencies by `npm run notices` and included in the build. There is no external font or script CDN.
