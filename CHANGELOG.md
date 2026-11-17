# Changelog

## 3.0.0-preview.1 — Many sources, any track

### Forecasts

- Up to 19 sources from 14 forecasting centres instead of 2: 12 models through Open-Meteo (ECMWF IFS and AIFS, NOAA GFS, DWD ICON, Météo-France, UK Met Office, Canada GEM, JMA, CMA GRAPES, KNMI Harmonie, MeteoSwiss ICON, ItaliaMeteo ICON), MET Norway, the DWD's MOSMIX through Bright Sky, the US National Weather Service, SMHI, FMI, DMI and GeoSphere Austria (off by default until it has been checked against a live answer).
- A Sources card shows which answered, which have nothing for the place and which failed. A service that does not cover a track is not asked.
- Forecasts reach 7 days ahead instead of 5.
- A new way of combining: sources of the same forecasting centre are merged first, the combined value is the median of the centres, and the range is their 10th to 90th percentile, shown from 3 centres. This replaces the 95% Student's t interval, which filled the charts with 2 sources. See `docs/METHOD.md`.
- Rain shows an amount and a count, "3 of 9 expect ≥ 0.5 mm", instead of "Chance of rain 100%". The threshold is 0.5 mm in the 3 hours, up from 0.1 mm.
- Each service's answer is kept on its own (10 minutes, 1 minute after a failure), so one failing service no longer makes every page ask all of them again.

### Tracks and sessions

- Add a track at any coordinates. The rule that a track had to be within 3 km of a Grade 1 circuit is gone. Tracks you add can be edited and deleted.
- Each track can have its own weekend: the date of its first day and up to 8 sessions with their own name, day and time. The default weekend is unchanged.
- A session in the sidebar opens its dashboard.

### History

- History and Track comparison work for any track, from Open-Meteo's reanalysis archive, over the last 14, 30 or 90 days, with the day's strongest wind. The log bundled with the app is now the fallback when the archive cannot be reached.
- Track comparison offers the same tracks as the sidebar, including your own, and names a track that has no history instead of failing.
- A rain day is a day with at least 1 mm.

### The app

- First-run set-up for the track and units. Settings for appearance, °C or °F, km/h, mph or m/s, and which forecast services to use. An About screen with the version, privacy, credits and licences.
- Without a connection the last forecast of a track is shown, with when it was fetched; it reloads by itself when the connection is back.
- Loading placeholders, a retry button on failures, and messages for a weekend that is over or out of reach.
- The satellite view uses Sentinel-2 cloudless by EOX, with a switch to a street map. Esri World Imagery is no longer used: its terms require a paid subscription.
- The sidebar keeps the sessions and settings in view while the track list scrolls. The desktop window opens at 1280 × 860 and remembers its size and position.
- Charts and tables describe themselves to screen readers; dialogs close with Escape; a skip link leads to the content.
- The desktop app identifies itself to every service it contacts.

### Documents

- `docs/DATA_SOURCES.md` (every source's terms), `docs/METHOD.md`, `docs/RELEASE.md`, `docs/PRIVACY.md` and `docs/EULA.md`.

## 3.0.0-preview.0 — A new start

Pitwall 3 is rebuilt from the racetrack weather app and replaces the 2.x app entirely.

- Weekend overview, Session dashboard, History and Track comparison pages.
- Open-Meteo and MET Norway combined on 3-hour UTC windows, with a 95% confidence interval and wind direction by sector vote. A failing provider is skipped with its own message.
- The 16 FIA Grade 1 circuits in EU countries, plus your own tracks within 3 km of one.
- Rain radar from RainViewer and a satellite view of the circuit.
- Logged weather for History and Track comparison bundled with the app.
- Light and dark appearance.
- Desktop app with its own profile and local address ("Pitwall 3 Preview"), so it can sit next to 2.x previews.
