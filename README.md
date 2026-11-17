# Pitwall

Racetrack weather for a race weekend. Pitwall combines two free forecasts into one, with a 95% confidence interval, shows the rain radar around the circuit, and compares the weather logged at each track.

No account and no API key: everything runs on your computer.

## What's in it

- **Weekend overview:** rain and temperature, then wind, over the three race days, with the 95% interval and the sessions marked. Below, the circuit from above next to the last two hours of rain radar.
- **Session dashboard:** FP1, FP2, FP3, Qualifying and Race one at a time: temperature, chance of rain, wind strength and direction, combined first, then provider by provider.
- **History:** what the weather did at the selected track over the logged days: daily rain, lowest and highest temperature, and the daily swing.
- **Track comparison:** 2 to 4 tracks over the same days, from wettest to driest.

Pick one of the 16 FIA Grade 1 circuits in EU countries, or add your own track by name and coordinates. A new track is accepted only within 3 km of a Grade 1 circuit; it is kept on this device.

Session times are the same for every track for now, in UTC over the next three days from tomorrow: FP1 and FP3 at 08:00, FP2 and Qualifying at 14:00, Race at 13:00.

## How forecasts are combined

Open-Meteo and MET Norway are both cut into the same 3-hour UTC windows. For each window Pitwall shows the mean and a 95% confidence interval (mean ± t × standard deviation / √n, Student's t for the number of providers that answered; no interval with only one). Wind direction is never averaged: each provider votes for one of 8 compass sectors, for example "2 of 2 agree: SW". MET Norway reaches about 2.5 days ahead, so later windows have a single provider.

If a provider fails, it is skipped with a warning and the other still loads.

## Run it

**Desktop app:** download the Windows or Mac installer from the project's releases. Previews are not signed, so your system may warn before opening them.

**From source:** with [Node.js](https://nodejs.org/) 22.13 or newer,

```sh
npm ci
npm start        # builds, then serves the app at http://localhost:4173
```

On Windows you can also double-click `Start Pitwall.cmd`, and on a Mac `Start Pitwall.command`.

## Develop

```sh
npm run dev          # live-reloading app at http://localhost:5173
npm run check        # lint, formatting, unit tests, types and a production build
npm run test:e2e     # browser tests with synthetic provider answers
npm run desktop      # the Electron app
npm run desktop:windows   # Windows installer in release/
```

Tests never call the weather services.

## Data and credits

Forecasts: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0) and [MET Norway](https://api.met.no/) (CC BY 4.0). Radar: [RainViewer](https://www.rainviewer.com/). Maps: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors and Esri World Imagery. The History and Track comparison pages use weather logged every 30 minutes at each track from 29 October to 13 November 2026 from [OpenWeatherMap](https://openweathermap.org/) (CC BY-SA 4.0), bundled with the app. See [THIRD_PARTY.md](THIRD_PARTY.md).

Pitwall is MIT licensed. It is not affiliated with any circuit, championship or weather service.
