import { userMessage } from "./http.ts";
import type { ForecastProvider, Location } from "./providers.ts";
import type { ForecastPoint } from "./types.ts";

export interface ForecastResult {
  points: ForecastPoint[];
  /** One line per provider that failed, e.g. "MET Norway: Could not connect…". */
  failures: string[];
}

/**
 * Ask every provider at once. A provider that fails is skipped and its message
 * kept, so the others still load.
 */
export async function fetchAllForecasts(
  location: Location,
  providers: ForecastProvider[],
  now: number = Date.now(),
): Promise<ForecastResult> {
  const answers = await Promise.allSettled(
    providers.map((provider) => provider.forecast(location, now)),
  );
  const points: ForecastPoint[] = [];
  const failures: string[] = [];
  answers.forEach((answer, index) => {
    if (answer.status === "fulfilled") points.push(...answer.value);
    else
      failures.push(`${providers[index].label}: ${userMessage(answer.reason)}`);
  });
  return { points, failures };
}
