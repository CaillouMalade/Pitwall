# Privacy

Pitwall collects nothing about you. There is no account, no analytics, no crash reporting, no advertising and no server run by Pitwall. The app works entirely on your computer.

## What stays on your computer

- The tracks you add (name and coordinates) and each track's weekend.
- Your settings: units, appearance, which forecast services are on, which circuit view you last used.
- The last forecast of the few tracks you opened most recently, so the app has something to show without a connection.
- On the desktop app, the size and position of the window.

All of it is kept in the app's own profile folder and never sent anywhere. Uninstalling the Windows app leaves that folder in place so a reinstall finds your tracks; delete "Pitwall 3 Preview" from your user AppData folder (Windows) or `~/Library/Application Support` (Mac) to remove it.

## What leaves your computer

To show weather for a track, Pitwall asks public weather and map services directly from your computer. Each request contains:

- **The coordinates of the track**, rounded to 4 decimals, about 11 metres. For map and radar images, the request names the map tiles around the track.
- **Your IP address**, as with any internet request. The services see it; Pitwall never does.
- **A User-Agent naming the app and its version** ("Pitwall/3.0.0 (+https://github.com/Arthur-Brht/pitwall)"), because several services require apps to identify themselves. It identifies the app, not you.

Nothing else is sent: no name, no identifier for you or your computer, no list of your tracks, no usage data. A service is only asked when you open a track or press Refresh, and a service that does not cover a track's region is not asked at all.

## The services

Open-Meteo, MET Norway, Bright Sky (for the German weather service's data), the US National Weather Service, SMHI (Sweden), FMI (Finland), DMI (Denmark), GeoSphere Austria (only if you turn it on), RainViewer, OpenStreetMap and EOX. Each keeps its own server logs under its own privacy policy. Two say how in the terms Pitwall read: MET Norway stores the IP address of direct requests in its logs, and DMI logs the IP address, the request and the time for up to 60 months.

You can turn any forecast service off in Settings. With no connection, Pitwall sends nothing.

## Links

Links in the About screen open in your web browser. From there on, the site you open applies its own privacy policy.

## Changes

If a later version changes any of this, this page and the changelog will say so. Questions: open an issue at https://github.com/Arthur-Brht/pitwall.
