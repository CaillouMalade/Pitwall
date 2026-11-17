# Pitwall

Race-weekend weather for teams, drivers and track days. Pitwall answers one question: **what will the weather do at this track over this weekend, and how sure are we?**

It asks up to 19 forecast sources from 14 forecasting centres about the same place, and shows one answer with how far they agree, next to the rain radar and the circuit from above. It is a desktop app for Windows and Mac, free, with no account and no API key. Everything runs on your computer.

## What it shows

Three things decide a session, so Pitwall shows those three:

- **Temperature**, for tyres and cooling, and how it moves through the weekend.
- **Rain**, where timing is everything: how much, and how many of the forecasts expect it.
- **Wind**, strength and direction, because of what it does to the car in fast corners.

Organised around the weekend:

- **Weekend overview.** Rain, temperature and wind over the three days, each with the range between the forecasts and the sessions marked. Below, which sources answered, the circuit from above and the last two hours of rain radar.
- **Session dashboard.** One session at a time: the combined answer, then every source next to its forecasting centre.
- **History.** What the weather did at the track over the last 14, 30 or 90 days.
- **Track comparison.** 2 to 4 tracks over the same days, wettest first.

## Tracks and sessions

The 16 FIA Grade 1 circuits in EU countries are built in. **Add a track anywhere** by name, latitude and longitude; tracks you add are kept on your computer and can be edited or deleted.

Every track starts with the same weekend: three days from tomorrow, FP1 and FP3 at 08:00, FP2 and Qualifying at 14:00, Race at 13:00, in UTC. **Each track can have its own weekend:** the date of its first day, and the name, day and time of up to 8 sessions.

Temperatures show in °C or °F and wind in km/h, mph or m/s. All times are UTC.

## How the answer is made

Each source is cut into the same 3-hour UTC windows. Sources from the same forecasting centre are merged first, so a centre with three feeds counts once. Then, for each window:

- the **combined value** is the median of the centres;
- the **80% range** is their 10th to 90th percentile, shown from 3 centres up;
- **rain** adds a count, such as "3 of 9 expect ≥ 0.5 mm";
- **wind direction** is a vote between 8 compass sectors, such as "7 of 9 agree: SW".

The range says how far the forecasts are apart. It is not a probability for the weather: forecasts can agree and still be wrong. [docs/METHOD.md](docs/METHOD.md) explains each choice.

## Sources

| Service                     | What it gives                                                                                                                                                 | Where                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Open-Meteo                  | 12 models: ECMWF IFS and AIFS, NOAA GFS, DWD ICON, Météo-France, UK Met Office, Canada GEM, JMA, CMA GRAPES, KNMI Harmonie, MeteoSwiss ICON, ItaliaMeteo ICON | Worldwide; the last three in their regions |
| MET Norway                  | Locationforecast                                                                                                                                              | Worldwide                                  |
| Bright Sky                  | The DWD's MOSMIX station forecast                                                                                                                             | Near a DWD station                         |
| US National Weather Service | The forecasters' gridded forecast                                                                                                                             | United States                              |
| SMHI                        | Point forecast                                                                                                                                                | Nordic countries                           |
| FMI                         | Harmonie                                                                                                                                                      | Northern Europe                            |
| DMI                         | Harmonie                                                                                                                                                      | North-west Europe                          |
| GeoSphere Austria           | 1 km model, off by default                                                                                                                                    | Alps and central Europe                    |

A service that fails is skipped with a warning and the others still load; one that does not cover a track is not asked. History comes from Open-Meteo's reanalysis archive, the radar from RainViewer, the maps from OpenStreetMap and the satellite view from Sentinel-2 cloudless by EOX.

Each service has its own terms. [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) lists what was read, what each one allows, and the points that are not confirmed. **Several sources are free only because Pitwall is free and carries no advertising.**

## Without a connection

Pitwall shows the last forecast it loaded for the track, and says when it was fetched. History falls back on a log of observations that comes with the app, for the built-in circuits that are in it.

## Privacy

Pitwall collects nothing. Your tracks and settings stay on your computer, and the weather services only receive the coordinates of the tracks you open. [docs/PRIVACY.md](docs/PRIVACY.md)

## Install

Download the Windows or Mac installer from the project's releases. The installers are not signed, so Windows and macOS warn before opening them; [docs/RELEASE.md](docs/RELEASE.md) shows what the warnings look like and how to open the app.

## Run from source

With [Node.js](https://nodejs.org/) 22.13 or newer:

```sh
npm ci
npm start        # builds, then serves the app at http://localhost:4173
```

On Windows you can also double-click `Start Pitwall.cmd`, and on a Mac `Start Pitwall.command`.

## Develop

```sh
npm run dev               # live-reloading app at http://localhost:5173
npm run check             # lint, formatting, unit tests, types and a production build
npm run test:e2e          # browser tests on invented answers
npm run desktop           # the Electron app
npm run desktop:windows   # Windows installer in release/
```

Tests never call the weather services. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

The code is under the [MIT licence](LICENSE). The data keeps the terms of its sources: [THIRD_PARTY.md](THIRD_PARTY.md). Plain-language terms of use: [docs/EULA.md](docs/EULA.md).

Weather can differ from every forecast. Never rely on Pitwall alone for a safety decision. Pitwall is not affiliated with any circuit, championship or weather service.
