import { app } from "electron";
import { writeFile } from "node:fs/promises";

// Invoked only by the explicit local/CI --pitwall-test launch. No renderer API is exposed.
// Outside requests are blocked during this check, so both providers must fail with
// a visible warning while the app itself keeps working.
export async function packagedSmoke(window, origin) {
  const report = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (predicate) => {
      for (let i = 0; i < 150 && !predicate(); i++)
        await new Promise(resolve => setTimeout(resolve, 100));
      return Boolean(predicate());
    };
    const pages = ['Weekend overview', 'Session dashboard', 'History', 'Track comparison'];
    const rendered = () => pages.every(label =>
      [...document.querySelectorAll('nav[aria-label="Pages"] button')].some(button => button.textContent === label));
    await waitFor(rendered);
    const warned = await waitFor(() =>
      ['Skipped Open-Meteo', 'Skipped MET Norway'].every(text => document.body.innerText.includes(text)));
    const reopen = ${JSON.stringify(process.env.PITWALL_SMOKE_REOPEN === "1")};
    const previous = localStorage.getItem('pitwall-desktop-smoke');
    if (!reopen) {
      localStorage.setItem('pitwall-desktop-smoke', 'retained');
      document.querySelector('[role="radiogroup"][aria-label="Appearance"] [aria-label="Dark"]').click();
      await waitFor(() => localStorage.getItem('pitwall-theme') === 'dark' && document.documentElement.dataset.theme === 'dark');
    }
    // Red Bull Ring, the first track, has no logged history yet; Monza does.
    [...document.querySelectorAll('ul[aria-label="Tracks"] button')].find(button => button.textContent.startsWith('Monza')).click();
    [...document.querySelectorAll('nav[aria-label="Pages"] button')].find(button => button.textContent === 'History').click();
    const history = await waitFor(() => document.body.innerText.includes('Days logged'));
    return {
      title: document.title,
      rendered: rendered(),
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
