import { test as base, expect, type Page } from "@playwright/test";

// Synthetic provider answers for the browser tests only. The shipped app has no
// demo mode: every forecast it shows comes from the real services.
export const TEST_TIME = new Date("2026-11-17T09:20:00Z");
const DAY_START = Date.UTC(2026, 10, 17);
const HOUR = 3_600_000;

const iso = (time: number) => new Date(time).toISOString();

function openMeteoAnswer() {
  const hours = Array.from({ length: 6 * 24 }, (_, i) => DAY_START + i * HOUR);
  return {
    hourly: {
      time: hours.map((time) => iso(time).slice(0, 16)),
      temperature_2m: hours.map((_, i) =>
        Number((11 + 4 * Math.sin((i - 9) / 3.8)).toFixed(1)),
      ),
      wind_speed_10m: hours.map((_, i) => 4 + (i % 24) / 12),
      wind_direction_10m: hours.map(() => 225),
      // A wet spell on the first afternoon of the weekend.
      precipitation: hours.map((_, i) => (i >= 36 && i <= 42 ? 0.6 : 0)),
    },
  };
}

function metNorwayAnswer() {
  const hours = Array.from({ length: 70 }, (_, i) => DAY_START + i * HOUR);
  return {
    properties: {
      timeseries: hours.map((time, i) => ({
        time: iso(time).replace(".000", ""),
        data: {
          instant: {
            details: {
              air_temperature: Number(
                (10.4 + 4 * Math.sin((i - 9) / 3.8)).toFixed(1),
              ),
              wind_speed: 4.6 + (i % 24) / 12,
              wind_from_direction: 232,
            },
          },
          next_1_hours: {
            details: { precipitation_amount: i >= 37 && i <= 43 ? 0.4 : 0 },
          },
        },
      })),
    },
  };
}

const RADAR = {
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: Array.from({ length: 13 }, (_, i) => ({
      time: Math.floor(TEST_TIME.getTime() / 1000) - (12 - i) * 600,
      path: `/v2/radar/${i}`,
    })),
  },
};

// A 1×1 transparent PNG for every map tile.
const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export interface ProviderState {
  metNorwayStatus: number;
  requests: string[];
}

export const test = base.extend<{ providers: ProviderState }>({
  providers: async ({ context }, provide) => {
    const state: ProviderState = { metNorwayStatus: 200, requests: [] };
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
        return route.continue();
      state.requests.push(url.hostname);
      if (url.hostname === "api.open-meteo.com")
        return route.fulfill({ json: openMeteoAnswer() });
      if (url.hostname === "api.met.no")
        return state.metNorwayStatus === 200
          ? route.fulfill({ json: metNorwayAnswer() })
          : route.fulfill({ status: state.metNorwayStatus, body: "" });
      if (url.hostname === "api.rainviewer.com")
        return route.fulfill({ json: RADAR });
      if (/tile|arcgisonline|rainviewer/.test(url.hostname))
        return route.fulfill({ body: TILE, contentType: "image/png" });
      // Nothing else may leave the machine during a test.
      return route.abort();
    });
    await provide(state);
  },
  page: async ({ page, providers: _providers }, provide) => {
    await page.clock.setFixedTime(TEST_TIME);
    await provide(page);
  },
});

/** Pick a track with whichever control the layout shows. */
export async function selectTrack(page: Page, name: string) {
  const select = page.getByRole("combobox", { name: "Track" });
  if (await select.isVisible()) await select.selectOption({ label: name });
  else
    await page
      .getByRole("list", { name: "Tracks" })
      .getByRole("button", { name })
      .click();
}

export async function openPage(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name })
    .click();
}

export { expect };
