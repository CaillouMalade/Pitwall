# Changelog

## 3.0.0-preview.3 — Frosted for real

- The frosted panels are now really frosted in the desktop app: the blur was dropped when the app was built. The page bar and the timeline get a frosted back once the page scrolls under them.
- The rain map opens closer in, with a ring around the circuit. Its switch reads "Forecast" and "Past & current", and the radar slider shows the time it is on.
- In "How far the forecasts are apart", dots that would cover each other are stacked.
- The session list says its times are local time.

## 3.0.0-preview.2 — By the hour, by the session

### Forecasts

- Hourly steps instead of 3-hour windows, for every source. Rain counts from 0.2 mm in an hour (it was 0.5 mm in 3 hours).
- All times are the track's own local time, not UTC. A track you add gets its time zone looked up once.
- A tooltip only shows on the chart under the pointer; the others keep the vertical line.

### Session dashboard

- A session has a length. Its values are for the whole session: mean temperature and wind, total rain, and a count of the centres with a wet hour.
- A verdict in words, and a grade for how far the forecasts agree, overall and for rain, temperature and wind.
- A map of the forecast rain around the circuit in 15-minute steps, with play and a slider, and the rain radar of the last two hours next to it. The forecast map is one model (Open-Meteo best match), and says so.
- The wind over the circuit: one arrow for all forecasts, one per centre, and headwind, tailwind or crosswind on each straight.
- The overview's charts around the session, rain at the track in 15-minute steps, every centre as a dot on a line, and rain in the 3 hours before.

### Weekend overview

- The circuit's layout from its outline, with the pit straight, the driving direction and the lap length, in place of the rain radar.
- Each session as a tile: temperature, how many expect rain, wind, and how far the forecasts agree. A tile opens its session.

### Tracks and weekends

- The track list folds away, and stays as you left it.
- Weekend types: save a list of sessions under a name, reuse it on any track, and make one the default for every track.
- Sessions have a length in minutes.
- Outlines of the 16 built-in circuits come with the app. For a track you add, a button fetches the racetrack lines from OpenStreetMap once.

### History and comparison

- History has three views: the weekend's dates over the last 20 years, the last 14, 30 or 90 days, and any dates since 1940 by the hour.
- Track comparison shows one row of charts per track on shared scales, and ranked bars for rain, rain days, temperature and wind.
- Export to CSV: every hour of the days shown, for one track or for all compared tracks, in UTC and in the track's time.
- Days are the track's own calendar days, with gusts and the prevailing wind direction.

### The app

- A new look: frosted panels over a glow that follows the weekend's weather, bundled fonts (Space Grotesk and Inter), motion that stops when the system asks for reduced motion.
- `docs/METHOD.md` and `docs/DATA_SOURCES.md` cover the new parts. The Overpass API is used only on a button press: its operators discourage apps for the general public from relying on it.

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
