export interface Track {
  id: string;
  name: string;
  /** Empty for a track the user added. */
  country: string;
  latitude: number;
  longitude: number;
  /** IANA time zone, like "Europe/Brussels". Missing until it has been looked up. */
  timezone?: string;
}

/**
 * One source's forecast for one hour. Units: °C, m/s, degrees, mm.
 * A value the source does not send stays null, never a made-up 0.
 */
export interface ForecastPoint {
  /** A source id from sources.ts, e.g. "ecmwf-ifs" or "met-norway". */
  source: string;
  /** Start of the hour, in epoch milliseconds (UTC). */
  time: number;
  /** At the start of the hour. */
  temperature: number | null;
  windSpeed: number | null;
  /** Direction the wind comes from. */
  windDeg: number | null;
  /** Total over the hour. */
  rain: number | null;
}

export interface RadarFrame {
  time: number;
  /** Tile address with {z}/{x}/{y} for the map to fill in. */
  url: string;
  /** True for a frame that is RainViewer's forecast, not a measurement. */
  forecast: boolean;
}
