# Releasing Pitwall

Pitwall is given away for free: no price, no store, no payment channel. The natural place to publish it is GitHub Releases, which costs nothing. This page covers how to build the installers, what users see when they open an unsigned build, and what signing would cost.

Nothing here has been bought, requested or signed up for.

## Build

```sh
npm ci
npm run check             # lint, formatting, unit tests, types, notices, production build
npm run test:e2e          # browser tests on invented data
npm run desktop:windows   # release/Pitwall-<version>-windows-x64-preview-setup.exe
npm run desktop:smoke     # launches the packaged app twice, with the network blocked
npx playwright test --config playwright.desktop.config.ts
node scripts/package-manifest.mjs   # SHA-256 checksums and build info
```

The Windows installer builds on Windows. The Mac build (`npm run desktop:mac`: a universal DMG and ZIP) needs a Mac, so it runs in the "Build desktop apps" workflow (`.github/workflows/macos.yml`) on GitHub's Mac runners. That workflow also builds and tests the Windows installer, and on a `v*` tag it drafts a GitHub release with both installers and their checksums. The draft is not published until someone publishes it.

## Before the first public release

These are decisions, not bugs:

1. **Name and version.** The app still calls itself "Pitwall 3 Preview" (`desktop/app-identity.json`) with version `3.0.0-preview.2`, its own profile folder and its own local address, so it can sit next to a 2.x install. For a final release, set the name to "Pitwall", pick the app id and profile, set the version to `3.0.0`, and remove "preview" from the installer names in `electron-builder.config.cjs`, `scripts/package-manifest.mjs`, `scripts/windows-installer-smoke.ps1` and the workflow. Changing the app id or the profile means settings from the preview are not carried over.
2. **Data terms.** Read [DATA_SOURCES.md](DATA_SOURCES.md) again. Two sources are unconfirmed for a public app (RainViewer; MET Norway's wording about direct calls) and both can be settled by asking, which is free. GeoSphere Austria stays off until it has been checked against a live answer.
3. **Contact in the User-Agent.** The desktop app identifies itself to the weather services with the GitHub repository address. That address must be public and monitored once the app is public, because MET Norway uses it to reach the developer before blocking.

## Unsigned builds: what users see

The installers are not signed, so both systems warn. The app works; the warning is about who made it, not about what it does.

### Windows

- **SmartScreen** shows "Windows protected your PC" when the installer is run. The user clicks **More info**, then **Run anyway**.
- Browsers may flag the download as "not commonly downloaded" and ask to keep it.
- The warning fades for a signed file once enough people have run it; an unsigned file never builds that reputation.
- The installer does not ask for administrator rights and installs for the current user only.

### Mac

- The preview is ad-hoc signed and not notarised. Gatekeeper says the app "cannot be opened because Apple cannot check it for malicious software" (wording varies by macOS version).
- On macOS 15 and later: open the app once, then go to **System Settings → Privacy & Security**, scroll to the message about Pitwall and click **Open Anyway**. On older versions: right-click the app, choose **Open**, then **Open** again.
- Managed Macs (work or school) can block this entirely.

The release notes should say this plainly, with the steps above, and publish the SHA-256 checksums so a download can be verified.

## Signing: what it would cost

None of this is needed to distribute the app. The figures are approximate, from the vendors' public price lists as the author knows them; they were not re-checked when this was written, so confirm them before deciding.

| What                                  | Removes                                                                                | Cost                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program               | The Gatekeeper block (Developer ID signing and notarisation)                           | 99 USD a year. Notarisation itself is free for members. Apple waives the fee for some non-profits, schools and government bodies.                                         |
| Windows code-signing certificate (OV) | The "unknown publisher" label; SmartScreen still warns until the file has a reputation | Typically 200 to 400 USD a year from a certificate authority, plus a hardware token or cloud key store, which the rules now require.                                      |
| Azure Trusted Signing (Microsoft)     | Same as a certificate, with Microsoft's reputation behind it                           | About 10 USD a month. Open to organisations and, in some countries, to individuals; eligibility has to be checked.                                                        |
| Microsoft Store                       | SmartScreen entirely, for Store installs                                               | A one-time registration fee for an individual account (about 19 USD; Microsoft has been waiving it in some countries). A different packaging format and a review process. |

### Free options

- **SignPath Foundation** signs Windows builds of open-source projects for free. The project has to apply and meet its conditions (an OSI-approved licence, which MIT is; builds made by a public CI; no proprietary parts). Nothing has been applied for.
- **Winget, Scoop, Homebrew Cask.** Free package managers. They do not remove the warnings by themselves, but they give users a familiar, scripted way to install and update. Each has its own acceptance rules (Homebrew Cask has been moving towards requiring notarised apps), so check them first.
- **Checksums and a public build.** Free and already in place: the workflow builds from the public source and publishes `SHA256SUMS.txt`. It proves the file is the one CI built; it does not remove any warning.
- **There is no free way to pass Gatekeeper** for a downloaded Mac app. Notarisation needs the paid Apple Developer Program.

The build is already set up for signing if credentials ever exist: `PITWALL_SIGNED_RELEASE=1` with the certificate and Apple API key in the environment switches the Mac build to Developer ID signing and notarisation (`electron-builder.config.cjs`), and the workflow has a manual "signed" input that reads them from repository secrets. Without them it stays on the unsigned path.

## What a release contains

- `Pitwall-<version>-windows-x64-preview-setup.exe`, `WINDOWS-SHA256SUMS.txt`, `WINDOWS-BUILD-INFO.json`
- `Pitwall-<version>-mac-universal-preview.dmg` and `.zip`, `SHA256SUMS.txt`, `BUILD-INFO.json`

Inside the app: the MIT licence, the third-party notices, Electron's and Chromium's licences, and the data terms, privacy and terms-of-use documents.

There is no update mechanism: the app never contacts a server of its own. Users get a new version by downloading it; the release notes are where to say so.
