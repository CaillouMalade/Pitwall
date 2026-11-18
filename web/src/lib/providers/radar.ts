// RainViewer: the list of recent radar images for the map.

import { getJson, ServiceError, type FetchLike } from "../http.ts";
import type { RadarFrame } from "../types.ts";
import { FormatError, list, numberOrNull, readOrFail, record } from "./read.ts";

// 256-pixel tiles, colour scheme 2 (the one RainViewer still serves), smoothed, with snow shown.
const TILE_SETTINGS = "/256/{z}/{x}/{y}/2/1_1.png";
const RADAR_FORMAT = "RainViewer sent its radar list in an unexpected format.";
const RAINVIEWER_HOST =
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.rainviewer\.com$/;

/**
 * Every radar image of the last 2 hours, oldest first, followed by RainViewer's
 * own short forecast frames when it publishes any.
 */
export async function radarFrames(
  fetchImpl?: FetchLike,
): Promise<RadarFrame[]> {
  const data = await getJson(
    "https://api.rainviewer.com/public/weather-maps.json",
    { fetch: fetchImpl },
  );
  const frames = readOrFail(RADAR_FORMAT, () => {
    const answer = record(data);
    const host = answer.host;
    // Tiles are only ever loaded from RainViewer's own servers.
    if (typeof host !== "string" || !RAINVIEWER_HOST.test(host))
      throw new FormatError();
    const radar = record(answer.radar);
    const read = (items: unknown, forecast: boolean) =>
      list(items).map((item): RadarFrame => {
        const image = record(item);
        const seconds = numberOrNull(image.time);
        if (seconds === null || typeof image.path !== "string")
          throw new FormatError();
        return {
          time: seconds * 1000,
          url: host + image.path + TILE_SETTINGS,
          forecast,
        };
      });
    return [
      ...read(radar.past, false),
      ...(Array.isArray(radar.nowcast) ? read(radar.nowcast, true) : []),
    ];
  });
  // An empty list would leave the map with nothing to show, so it counts as a bad answer.
  if (frames.length === 0) throw new ServiceError("format", RADAR_FORMAT);
  return frames;
}
