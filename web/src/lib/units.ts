// Display units. Everything is kept in °C, m/s and mm; only what is shown changes.

export type TemperatureUnit = "c" | "f";
export type WindUnit = "kmh" | "mph" | "ms";

export interface Units {
  temperature: TemperatureUnit;
  wind: WindUnit;
}

export const TEMPERATURE_UNITS: readonly {
  value: TemperatureUnit;
  label: string;
}[] = [
  { value: "c", label: "°C" },
  { value: "f", label: "°F" },
];

export const WIND_UNITS: readonly { value: WindUnit; label: string }[] = [
  { value: "kmh", label: "km/h" },
  { value: "mph", label: "mph" },
  { value: "ms", label: "m/s" },
];

export const temperatureLabel = (unit: TemperatureUnit) =>
  unit === "f" ? "°F" : "°C";

export const windLabel = (unit: WindUnit) =>
  unit === "mph" ? "mph" : unit === "ms" ? "m/s" : "km/h";

/** A temperature in °C in the chosen unit. */
export function toTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
}

/** A difference between two temperatures: scaled, never shifted by 32. */
export function toTemperatureDifference(
  celsius: number,
  unit: TemperatureUnit,
): number {
  return unit === "f" ? (celsius * 9) / 5 : celsius;
}

const WIND_FACTORS: Record<WindUnit, number> = {
  kmh: 3.6,
  mph: 2.2369362921,
  ms: 1,
};

/** A wind speed in m/s in the chosen unit. */
export function toWind(metresPerSecond: number, unit: WindUnit): number {
  return metresPerSecond * WIND_FACTORS[unit];
}

/** Decimals worth showing: m/s numbers are small, so they keep one. */
export const windDigits = (unit: WindUnit) => (unit === "ms" ? 1 : 0);

/** °F and mph where they are the custom, mph in the UK, °C and km/h elsewhere. */
export function defaultUnits(locale: string | undefined): Units {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? "")?.[1]?.toUpperCase();
  if (region === "US" || region === "LR" || region === "MM")
    return { temperature: "f", wind: "mph" };
  if (region === "GB") return { temperature: "c", wind: "mph" };
  return { temperature: "c", wind: "kmh" };
}

export function isUnits(value: unknown): value is Units {
  const units = value as Units | null;
  return (
    typeof units === "object" &&
    units !== null &&
    TEMPERATURE_UNITS.some((item) => item.value === units.temperature) &&
    WIND_UNITS.some((item) => item.value === units.wind)
  );
}
