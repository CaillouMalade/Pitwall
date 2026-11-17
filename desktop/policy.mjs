// The pages the About screen links to. Any other link is not opened.
const externalHosts = new Set([
  "open-meteo.com",
  "api.met.no",
  "www.dwd.de",
  "www.weather.gov",
  "www.smhi.se",
  "en.ilmatieteenlaitos.fi",
  "www.dmi.dk",
  "data.hub.geosphere.at",
  "www.rainviewer.com",
  "www.openstreetmap.org",
  "s2maps.eu",
  "openweathermap.org",
]);

export function externalLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (externalHosts.has(url.hostname)) return url.href;
    if (
      url.hostname === "github.com" &&
      /^\/Arthur-Brht\/pitwall-?(?:\/|$)/.test(url.pathname)
    )
      return url.href;
  } catch {
    /* Invalid and non-HTTPS links are never opened. */
  }
  return null;
}

export function isAppPage(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === "/";
  } catch {
    return false;
  }
}

export function isAppDownload(value, origin) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "blob:" && url.origin === origin) ||
      (url.origin === origin && url.pathname === "/THIRD_PARTY_NOTICES.txt")
    );
  } catch {
    return false;
  }
}
