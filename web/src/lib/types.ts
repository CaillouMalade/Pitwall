export interface Track {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

export type ProviderId = "open-meteo" | "met-norway";

/**
 * One provider's forecast for one 3-hour window. Units: °C, m/s, degrees, mm.
 * A value the provider does not send stays null, never a made-up 0.
 */
export interface ForecastPoint {
  source: ProviderId;
  /** Start of the 3-hour window, in epoch milliseconds (UTC). */
  time: number;
  temperature: number | null;
  windSpeed: number | null;
  /** Direction the wind comes from. */
  windDeg: number | null;
  /** Total over the whole 3-hour window. */
  rain: number | null;
}

export interface RadarFrame {
  time: number;
  /** Tile address with {z}/{x}/{y} for the map to fill in. */
  url: string;
}
