import { app } from "electron";
import { writeFile } from "node:fs/promises";

// Invoked only by the explicit local/CI --pitwall-test launch. No renderer API is exposed.
// Outside requests are blocked during this check, so every service must fail
// with a visible warning while the app itself keeps working: the first-run
// set-up, the settings, and the History page from the bundled log.
export async function packagedSmoke(window, origin) {
  const report = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (predicate) => {
      for (let i = 0; i < 150 && !predicate(); i++)
        await new Promise(resolve => setTimeout(resolve, 100));
      return Boolean(predicate());
    };
    const pages = ['Weekend overview', 'Session dashboard', 'History', 'Track comparison'];
    const rendered = () => pages.every(label =>
      [...document.querySelectorAll('nav[aria-label="Pages"] button')].some(button => button.textContent.trim() === label));
    await waitFor(rendered);
    const reopen = ${JSON.stringify(process.env.PITWALL_SMOKE_REOPEN === "1")};
    const previous = localStorage.getItem('pitwall-desktop-smoke');
    const button = (label, root = document) =>
      [...root.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    // The first launch opens the set-up; the second must not.
    const setup = () => document.querySelector('dialog[open]');
    // The dialog opens just after the page is drawn, so give it a moment.
    const setupShown = reopen
      ? (await new Promise(resolve => setTimeout(resolve, 1000)), Boolean(setup()))
      : await waitFor(() => setup());
    if (!reopen) {
      localStorage.setItem('pitwall-desktop-smoke', 'retained');
      button('Continue', setup()).click();
      await waitFor(() => !setup());
      button('Settings').click();
      await waitFor(() => setup());
      [...setup().querySelectorAll('[role="radiogroup"][aria-label="Appearance"] button')]
        .find(item => item.textContent.trim() === 'Dark').click();
      await waitFor(() => localStorage.getItem('pitwall-theme') === 'dark' && document.documentElement.dataset.theme === 'dark');
      setup().querySelector('button[aria-label="Close"]').click();
      await waitFor(() => !setup());
    }
    const warned = await waitFor(() =>
      ['Skipped Open-Meteo', 'Skipped MET Norway'].every(text => document.body.innerText.includes(text)));
    // Red Bull Ring, the first track, has too little in the bundled log; Monza has days of it.
    // The track list is folded away until it is asked for.
    if (!document.querySelector('ul[aria-label="Tracks"] button'))
      document.querySelector('button[aria-controls="track-list"]').click();
    await waitFor(() => document.querySelector('ul[aria-label="Tracks"] button'));
    [...document.querySelectorAll('ul[aria-label="Tracks"] button')].find(item => item.textContent.startsWith('Monza')).click();
    [...document.querySelectorAll('nav[aria-label="Pages"] button')].find(item => item.textContent.trim() === 'History').click();
    // Recent days fall back on the bundled log when the archive cannot be reached.
    await waitFor(() => [...document.querySelectorAll('[role="radio"]')].some(item => item.textContent.trim() === 'Recent'));
    [...document.querySelectorAll('[role="radio"]')].find(item => item.textContent.trim() === 'Recent').click();
    const history = await waitFor(() => document.body.innerText.includes('Showing the log that comes with Pitwall'));
    return {
      title: document.title,
      rendered: rendered(),
      setupOnlyOnFirstLaunch: setupShown === !reopen,
      providersFailedGracefully: warned,
      historyLoaded: history,
      appearanceRetained: localStorage.getItem('pitwall-theme') === 'dark' && document.documentElement.dataset.theme === 'dark',
      desktop: window.pitwallDesktop?.isDesktop === true,
      nodeUnavailable: typeof require === 'undefined' && typeof process === 'undefined',
      persisted: !reopen || previous === 'retained',
      origin: location.origin
    };
  })()`);
  const preferences = window.webContents.getLastWebPreferences();
  report.sandbox =
    preferences.sandbox &&
    preferences.contextIsolation &&
    !preferences.nodeIntegration;
  report.packaged = app.isPackaged;
  report.version = app.getVersion();
  report.originMatches = report.origin === origin;
  await writeFile(
    process.env.PITWALL_SMOKE_OUTPUT,
    JSON.stringify(report, null, 2),
  );
  if (
    !report.rendered ||
    !report.setupOnlyOnFirstLaunch ||
    !report.providersFailedGracefully ||
    !report.historyLoaded ||
    !report.desktop ||
    !report.nodeUnavailable ||
    !report.persisted ||
    !report.appearanceRetained ||
    !report.sandbox ||
    !report.originMatches
  )
    throw new Error("Packaged desktop smoke check failed.");
}
