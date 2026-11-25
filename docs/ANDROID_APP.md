# Pitwall for Android

The Android app is the same interface as the browser and desktop apps, packaged with [Capacitor](https://capacitorjs.com/) so it runs from bundled files inside the system WebView. It is given away as an APK file on GitHub Releases, next to the desktop installers. It is not in a store.

## What differs on a phone

The pages, charts, maps and colours are the desktop ones. Only the frame around them changes, and only inside the packaged app:

- A top bar replaces the sidebar. It carries the sidebar's track card (outline, name, local time), which opens the system's track picker, and a menu with Add a track, Edit track, Edit sessions, Settings and About. Sessions are picked on the pages themselves.
- The page tabs keep their pills, gathered in a frosted dock at the bottom that stays on screen. Each page opens from its top.
- The glow behind the panels is sized for the phone; the desktop sizes it by window width, which leaves almost none on a narrow screen.
- Figures and session tiles sit two abreast.
- Dialogs rise from the bottom edge. The Android back gesture closes the open dialog or menu, then returns to the weekend overview, then leaves the app.
- On the maps, one finger scrolls the page and two fingers move and zoom the map.
- CSV exports open the Android share sheet, because a WebView cannot save a file link.
- Status and navigation bars follow the appearance chosen in Pitwall.
- Text keeps the desktop sizes and follows the font size set in Android's display settings.
- MET Norway is not among the forecast services. Its terms ask mobile apps to go through a server of their own, and Pitwall has none ([data sources](DATA_SOURCES.md)).

## Install

Download `Pitwall-<version>-android-preview.apk` from the release and open it on the phone. Android asks once to allow the browser or file manager to install apps, and Play Protect may ask to scan the file, because the app does not come from a store. Android 7 or newer. `ANDROID-SHA256SUMS.txt` has the file's checksum.

There is no automatic update: install a newer APK over the old one and the tracks and settings stay.

Tracks, sessions, settings and saved forecasts stay in the app's private storage on the device. Weather requests still go straight from the app to the public providers. [Privacy details](PRIVACY.md).

## Build and run (maintainers)

Needs Node.js 22.13 or newer, JDK 21 (`JAVA_HOME`) and the Android SDK with platform 36 (`ANDROID_HOME`).

```sh
npm ci
npm run android:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

That is a debug build for an emulator or a phone on a cable. `npm run android:sync` rebuilds the interface and copies it into `android/` without running Gradle. `npm run android:icons` re-renders the legacy launcher bitmaps from `web/public/icons/icon-512.svg`; Android 8 and newer use the vector adaptive icon.

## Release build

```sh
npm run android:release   # release/Pitwall-<version>-android-preview.apk and ANDROID-SHA256SUMS.txt
```

A release is signed with a key that is not in the repository. Gradle reads `~/.pitwall/android-signing.properties` (or the file named by `PITWALL_ANDROID_SIGNING`) with `storeFile`, `storePassword` and `keyAlias`; the key is a PKCS12 store whose password is also the key's. Android only installs an update signed with the same key, so that file and the key store have to be kept: without them every user would have to uninstall before installing a newer version. Raise `versionCode` in `android/app/build.gradle` by one for every published build.

## Where things live

```text
capacitor.config.ts                 App identity, User-Agent and system-bar inset handling
android/                            Gradle project, theme, icons and launch screen
android/app/.../PitwallShellPlugin  Window colour behind the system bars
web/src/lib/native.ts               Platform detection, share sheet, system bars, back gesture
web/src/components/PhoneBar.tsx     Top bar with the track picker and menu
web/src/styles.css                  Phone chrome under :root[data-platform="android"]
e2e/phone.spec.ts                   Phone layout checks with a stand-in bridge
```

The phone layout applies only when the Capacitor bridge is present, so browser and desktop sessions are unchanged.
