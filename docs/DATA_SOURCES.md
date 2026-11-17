# Data sources and their terms

Every outside service Pitwall uses, what its terms say, and how the app follows them. The terms were read on 17 November 2026; each entry links to the pages that were read. This is a reading of public terms, not legal advice, and terms change: check them again before a release.

**The conclusions below assume Pitwall stays free and unmonetised:** no price, no ads, no subscriptions, no in-app purchases and no income for its author. Several sources (Open-Meteo's free API, the satellite imagery, the rain radar) are free only on that condition. If Pitwall is ever sold or monetised, those have to be replaced or licensed first; the rows marked "non-commercial only" say which.

No source needs an account or a key, and nothing here costs money.

## Summary

| Source                            | Used for                           | Use in a free public app                                                                                  | Licence                       |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Open-Meteo forecast API           | 12 weather models                  | Allowed. **Non-commercial only**                                                                          | CC BY 4.0                     |
| MET Norway Locationforecast       | Forecast, worldwide                | Allowed, with **one point unconfirmed** (direct calls from a desktop app)                                 | NLOD 2.0 / CC BY 4.0          |
| Bright Sky (DWD open data)        | DWD MOSMIX forecast                | Allowed                                                                                                   | CC BY 4.0                     |
| US National Weather Service       | Forecast, United States            | Allowed                                                                                                   | Public domain                 |
| SMHI                              | Forecast, Nordic countries         | Allowed, with **one point unconfirmed** (the API's documentation could not be read)                       | CC BY 4.0                     |
| FMI                               | Forecast, northern Europe          | Allowed                                                                                                   | CC BY 4.0                     |
| DMI                               | Forecast, north-west Europe        | Allowed                                                                                                   | CC BY 4.0                     |
| GeoSphere Austria                 | Forecast, Alps, **off by default** | Allowed by its terms. **Not checked against a live answer**                                               | CC BY 4.0                     |
| Open-Meteo Historical Weather API | History                            | Allowed. **Non-commercial only**                                                                          | CC BY 4.0                     |
| OpenWeather (bundled log)         | History fallback                   | Allowed as read here, with **one point unconfirmed** (redistribution is not spelled out)                  | ODbL                          |
| RainViewer                        | Rain radar                         | **Unconfirmed.** The terms say "personal and educational use"; a free public app is not mentioned         | Its own terms                 |
| OpenStreetMap tiles               | Maps                               | Allowed under the tile usage policy                                                                       | ODbL                          |
| Sentinel-2 cloudless by EOX       | Satellite view                     | Allowed. **Non-commercial only**                                                                          | CC BY-NC-SA 4.0               |
| Esri World Imagery                | (removed)                          | **Not allowed without a paid ArcGIS subscription.** Pitwall 3.0.0-preview.0 used it; it is no longer used | Esri Master Licence Agreement |
| Met Éireann                       | (not used)                         | Its licence adds a duty to show its weather warnings, which Pitwall does not do                           | CC BY 4.0 plus conditions     |

## What the app does for every service

- **No background traffic.** Pitwall asks a service only when a track is opened or Refresh is pressed. It never polls while idle.
- **Caching.** A service's answer for a place is kept for 10 minutes, a failure for 1 minute, a history for 6 hours and the radar list for 10 minutes. On top of that, requests go through the browser engine's HTTP cache with its default settings, so a service's own `Expires` and `Cache-Control` headers are followed and repeat requests are sent with `If-Modified-Since`.
- **Only where it applies.** A service that does not cover a place (the US service for a European track) is not called at all.
- **Identification.** The desktop app sends `User-Agent: Pitwall/<version> (+https://github.com/Arthur-Brht/pitwall)` on every outside request (`desktop/main.mjs`). A browser cannot set this header, so when Pitwall is run from source in a browser the services see the browser's own.
- **Coordinates.** Sent with at most 4 decimals (about 11 m) where a service asks for it.
- **Attribution.** Every source is credited in About, the map credits stay on the maps, and the History pages name their source.
- **Allowlist.** The app's content security policy only lets it reach the hosts listed here (`scripts/start.mjs`).

Each user's computer calls the services directly, so rate limits that count per IP address apply per user, not to all users together. Limits that count per application (MET Norway's) apply to all users together.

## Forecasts

### Open-Meteo

- **Used for:** one request per track returns 12 models: ECMWF IFS and AIFS, NOAA GFS, DWD ICON, Météo-France, UK Met Office, Canada GEM, JMA, CMA GRAPES, KNMI Harmonie, MeteoSwiss ICON and ItaliaMeteo ICON. `https://api.open-meteo.com/v1/forecast`
- **Terms read:** [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing). The [licence page](https://open-meteo.com/en/license) returned no text when read, so the exact attribution wording is not confirmed.
- **Free public app:** allowed. The free API is for non-commercial use, and the terms give as an example "Private or non-profit websites or apps that do not have subscriptions or advertising." Commercial examples are "Websites or apps that have subscriptions or display advertisements" and "Commercial products or promotional activities."
- **Licence and credit:** "the weather data is CC BY 4.0", and "attribution is a requirement under this licence". Pitwall credits Open-Meteo with a link, and names the national services whose models it shows. The terms of each national service behind Open-Meteo were not read one by one; Pitwall relies on Open-Meteo's statement that it redistributes them under CC BY 4.0.
- **Key and User-Agent:** none required.
- **Limits:** "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute", applied "by IP addresses and application". Requests with more than 10 variables count as more than one call. Pitwall's request (4 variables × 12 models, 8 days) was measured at **4.8 calls** from the service's `X-RateLimit-Cost` header, so the daily limit allows about 2,000 forecast loads per user.

### MET Norway

- **Used for:** the Locationforecast, worldwide. `https://api.met.no/weatherapi/locationforecast/2.0/compact`
- **Terms read:** [terms of service](https://api.met.no/doc/TermsOfService) (revised 5 November 2026), [licence](https://api.met.no/doc/License).
- **Free public app:** allowed under the licence. **One point is unconfirmed:** the terms say "Browsers and mobile apps should not contact the API directly, but instead use a local proxy (backend for frontend) server". Desktop apps are not named. Pitwall has no server, so it calls the API directly from each computer, identified and cached as the terms ask. Whether that is acceptable for a desktop app was not confirmed. To settle it, ask MET Norway (free); if the answer is no, turn the service off by default in `web/src/lib/sources.ts`.
- **Licence and credit:** NLOD 2.0 and CC BY 4.0. "Credit should be given to The Norwegian Meteorological Institute, shortened MET Norway". Pitwall shows "Data from MET Norway". It may not look like a service made by Yr, NRK or MET Norway, and does not.
- **Identification:** "All requests must (if possible) include an identifying User Agent-string" with the application name and a contact. Without one "you risk being blocked without warning". The desktop app sends it.
- **Limits:** "Anything over 20 requests/second per application (total, not per client) requires special agreement." "Never repeat requests until the time indicated in the `Expires` response header" and use `If-Modified-Since`: the HTTP cache does both. Coordinates: "truncate all coordinates to max 4 decimals", which the adapter does.
- **Key:** none.

### Bright Sky (DWD)

- **Used for:** MOSMIX, the DWD's station forecast, from the station nearest the track (within 50 km). `https://api.brightsky.dev/weather`
- **Terms read:** [Bright Sky](https://brightsky.dev/), [DWD legal notice](https://www.dwd.de/EN/service/legal_notice/legal_notice.html).
- **Free public app:** allowed. "Bright Sky is free-to-use for all purposes. As it solely provides an additional method to access the DWD's meteorological data, the DWD's Terms of Use apply". The DWD's open data "may be re-used under the Creative Commons licence conditions CC BY 4.0 providing the source is acknowledged."
- **Credit:** Deutscher Wetterdienst. The DWD's page of credit templates was not read, so the exact wording is not confirmed.
- **Key, User-Agent, limits:** no key ("No API key required!"); nothing else is stated. Bright Sky is a volunteer project with no promise of availability. Its documentation page could not be read; the meaning of its fields (wind in km/h, rain as the total of the hour before) was taken from live answers and is tested on a saved one.

### US National Weather Service

- **Used for:** the forecasters' gridded forecast, for tracks in the United States. `https://api.weather.gov`
- **Terms read:** [API documentation](https://www.weather.gov/documentation/services-web-api), [disclaimer](https://www.weather.gov/disclaimer).
- **Free public app:** allowed. "All of the information presented via the API is intended to be open data, free to use for any purpose." The data "are in the public domain", so long as it is not claimed as one's own, no endorsement by NOAA or the NWS is implied, and it is not presented as official material once modified. Pitwall's About says no weather service endorses it.
- **Identification:** "A User Agent is required to identify your application." The desktop app sends it.
- **Limits:** "The rate limit is not public information"; after an error, retry "after the limit clears (typically within 5 seconds)". The grid cell of a place is asked for once and remembered, as the documentation suggests.
- **Key:** none today. The documentation says the User-Agent "will be replaced with an API key in the future"; if that happens this service becomes optional and off by default.

### SMHI

- **Used for:** the point forecast for the Nordic area. `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/...`
- **Terms read:** [conditions of use](https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning) (in Swedish, updated 15 June 2026).
- **Free public app:** allowed. CC BY 4.0 SE; use is permitted "även för kommersiella ändamål" (also for commercial purposes). SMHI must be named as the source, with a note when the material is changed.
- **Conditions:** use documented APIs only, do not fetch the same data repeatedly, follow the cache headers; SMHI may block IP addresses that misuse the service. Pitwall asks for one point per track and follows the cache headers.
- **Unconfirmed:** the documentation pages of this API returned nothing when read, so the meaning of `precipitation_amount_mean` (taken as the rain over the interval ending at `time`) is not confirmed. Pitwall only uses it for 1-hour intervals, where an amount and a rate are the same number. The older `pmp3g` API answered 404.
- **Key and User-Agent:** not stated; none needed.

### FMI

- **Used for:** the Harmonie forecast for northern Europe, from the open-data WFS service. `https://opendata.fmi.fi/wfs`
- **Terms read:** [open data licence](https://en.ilmatieteenlaitos.fi/open-data-licence), [open data manual](https://en.ilmatieteenlaitos.fi/open-data-manual).
- **Free public app:** allowed. CC BY 4.0; the manual says FMI "encourages both small and large developer individuals and organizations to … publish their creations either as free or commercial products."
- **Limits:** not in the pages read. The service's own response headers give 1,000 requests per 5 minutes and 50,000 per day.
- **Key:** none.

### DMI

- **Used for:** the Harmonie model for north-west Europe, from the forecast service. `https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position`
- **Terms read:** [terms of use](https://www.dmi.dk/friedata/dokumentation/terms-of-use), [authentication](https://www.dmi.dk/friedata/dokumentation/authentication).
- **Free public app:** allowed. "DMI's Open Data are distributed under the Creative Commons License CC BY 4.0", for any purpose, even commercially, with credit to DMI.
- **Key:** none. "As of Dec 2nd 2025 authentication and API keys are no longer required".
- **Limits:** fair use; DMI "may apply rate limiting, if misuse is detected". Apps "may not update with data via DMI's web services when the application is not active": Pitwall does not.
- **Note:** outside its area the service answers with its nearest grid point, however far away. The adapter checks the returned point and treats a distant one as "nothing for this place".

### GeoSphere Austria (off by default)

- **Used for:** the 1 km model for the Alps and central Europe. `https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km`
- **Terms read:** [licence](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/license.html), [request limit](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/request-limit.html), [authentication](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/authentication.html), [dataset page](https://data.hub.geosphere.at/dataset/nwp-v2-1h-1km).
- **Free public app:** allowed by its terms. "All data that requires no authentication is licensed under the Creative Commons Attribution 4.0."
- **Limits:** "5 requests per second and 240 requests per hour". No key.
- **Why it is off:** the data address answered with a server error every time it was tried on 17 November 2026, so the adapter was written from the documentation and the dataset's metadata, and has **not been checked against a live answer**. It can be turned on in Settings. Once an answer has been checked, remove it from `PROVIDERS_OFF_BY_DEFAULT` in `web/src/lib/sources.ts`.

## History

### Open-Meteo Historical Weather API

- **Used for:** the History and Track comparison pages, for any place. `https://archive-api.open-meteo.com/v1/archive`
- **What it is:** reanalysis, a weather model's reconstruction of past weather on a grid: ERA5 (0.25°), ERA5-Land (0.1°) and ECMWF IFS (9 km). It is not a gauge at the track, and the app says so under the charts.
- **Terms read:** [documentation](https://open-meteo.com/en/docs/historical-weather-api), with the same [terms](https://open-meteo.com/en/terms) and [pricing](https://open-meteo.com/en/pricing) as above. The pricing page lists this API in the free column; the terms page does not name it separately.
- **Free public app:** allowed, **non-commercial only**, as for the forecast API.
- **Credit:** Open-Meteo, CC BY 4.0. The documentation asks for "Generated using Copernicus Climate Change Service information" for ERA5.
- **Limits:** the same per-IP limits. One request per track and period, measured at 1 call, kept for 6 hours.

### OpenWeather (bundled log, the fallback)

- **Used for:** `web/src/data/observed-weather.csv`, the weather logged every 30 minutes at the tracks from 29 October to 13 November 2026 for the original project. It is shown only when the archive cannot be reached, and only for the built-in tracks that are in it.
- **Terms read:** [pricing and licences](https://openweathermap.org/price), [full price list](https://openweathermap.org/full-price).
- **Licence:** "All automated self-service plans are provided under the ODbL (Open Database License). Commercial use is allowed." An earlier version of this project's notes said CC BY-SA 4.0; the pages read say ODbL.
- **Credit:** "Visible attribution to OpenWeather in your application or service", for example "Weather data © OpenWeather". The app shows it whenever the log is shown, and in About.
- **Unconfirmed:** the pages do not say in so many words that stored data may be redistributed inside an app. The nearest passage is that a database built from the data and "distributed externally … must be offered under the same ODbL license". The bundled file is therefore offered under ODbL 1.0. To be safe without it, delete the file: History then needs a connection.
- Pitwall does not call OpenWeather.

## Radar and maps

### RainViewer (unconfirmed)

- **Used for:** the rain radar of the last 2 hours. `https://api.rainviewer.com/public/weather-maps.json` and its tile servers.
- **Terms read:** [API](https://www.rainviewer.com/api.html), [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html), [transition summary](https://www.rainviewer.com/api/transition-faq.html), [terms](https://www.rainviewer.com/terms.html).
- **Free public app: unconfirmed.** The API page says both "the public Weather Maps API is free for personal, educational, and small-scale community use" and "This API is available for personal and educational use only", and that it is "not intended for high-volume commercial applications". A free app given away to the public is not mentioned either way. To settle it, ask RainViewer (free). If the answer is no, the radar has to be removed or replaced; national radar services with open licences exist (for example the DWD's) but each covers one country.
- **Credit:** "You must display credit such as 'Weather data by RainViewer' with a link back to rainviewer.com". It is on the map.
- **Limits since 1 January 2026:** past frames only, zoom 7 at most, one colour scheme (2, "Universal Blue"), and "100 requests/IP/minute". Pitwall asks for exactly that and enlarges the images when zoomed in further. Moving the time slider quickly loads a set of tiles per frame, which is the one place a user could come near the per-minute limit.
- **Key:** none.

### OpenStreetMap tiles

- **Used for:** the base map under the radar, and the "Map" view of the circuit. `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- **Terms read:** [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- **Free public app:** allowed for apps that follow the policy. It asks for the exact URL above; "a clear, unique User-Agent string that names your app" (the desktop app sends one); the credit "© OpenStreetMap contributors" visible on the map; and "Honour server caching headers" (the HTTP cache does). Bulk downloading, prefetching and offline use are not permitted, and Pitwall does none of them.
- **No guarantee:** the service is best-effort and "We may block access, without notice, if your usage degrades the service." If Pitwall ever has many users, move to a tile provider with an agreed quota.
- **Data licence:** ODbL.

### Sentinel-2 cloudless by EOX

- **Used for:** the satellite view of the circuit, 10 m a pixel. `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/...`
- **Terms read:** [EOX::Maps](https://maps.eox.at/), [licence summary](https://cloudless.eox.at/documentation/license). The full legal text at cloudless.eox.at/license-legal was not read.
- **Free public app:** allowed. "Do you want to use our maps as part of your application? Just feel free to use them. We just ask for a link back to EOX::Maps as well as appropriate attribution".
- **Licence: non-commercial only.** CC BY-NC-SA 4.0; commercial use needs a licence from EOX.
- **Credit:** "Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)", with a link, on the map and in About.
- **No guarantee:** "The demo service is provided as is without any guarantee."

### Esri World Imagery (removed)

Pitwall 3.0.0-preview.0 loaded satellite tiles from `server.arcgisonline.com`. Esri's [summary of its terms](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf) (updated 21 April 2025) says: "Use with Esri software and comply with its terms of use. If you do not have Esri software, you must purchase an ArcGIS Online subscription." Pitwall has neither, so the imagery was replaced with Sentinel-2 cloudless. It is less sharp (10 m instead of about 1 m), which is the cost of a source whose terms allow it.

## Looked at and not used

- **Met Éireann** (Ireland): its forecast API is keyless, but its [custom licence](https://www.met.ie/about-us/specialised-services/open-data) is CC BY 4.0 "with an additional requirement to concurrently display our Weather Warnings". Pitwall does not show weather warnings, so it does not use this service.
- **OpenWeather's live API** needs a key, so Pitwall does not call it.
- **Météo-France, UK Met Office, KNMI, ECMWF, MeteoSwiss and others:** their own services were not evaluated here. Their models are reached through Open-Meteo instead.

## Adding a source

A source is one file in `web/src/lib/providers/` that turns the service's answer into `ForecastPoint`s on the 3-hour UTC windows, plus an entry in `web/src/lib/sources.ts` naming its forecasting centre, its host in the allowlist in `scripts/start.mjs`, a credit in `web/src/lib/credits.ts`, a test on a saved answer, and a section here with links to the terms that were read. A source that needs a key, even a free one, must be optional and off by default.
