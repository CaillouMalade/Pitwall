import { ServiceError, userMessage } from "./http.ts";
import type { ForecastProvider, Location } from "./providers/index.ts";
import { PROVIDER_LABELS, type ProviderId } from "./sources.ts";
import type { ForecastPoint } from "./types.ts";

/**
 * What became of one service: it answered, it answered with nothing for the
 * coming days, it does not forecast this place, or it failed.
 */
export type ProviderState = "answered" | "empty" | "outside" | "failed";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  state: ProviderState;
  /** Why it failed, written for the user. */
  message?: string;
  /** Every source the service can return, and the ones that did. */
  sources: readonly string[];
  answered: string[];
}

export interface ForecastResult {
  points: ForecastPoint[];
  /** One line per service that failed, e.g. "MET Norway: Could not connect…". */
  failures: string[];
  statuses: ProviderStatus[];
}

/**
 * Ask every service at once. One that fails is skipped and its message kept,
 * so the others still load; one that does not cover the place is not called.
 */
export async function fetchAllForecasts(
  location: Location,
  providers: readonly ForecastProvider[],
  now: number = Date.now(),
): Promise<ForecastResult> {
  const answers = await Promise.allSettled(
    providers.map((provider) =>
      provider.covers && !provider.covers(location)
        ? Promise.reject(new ServiceError("no-coverage", ""))
        : provider.forecast(location, now),
    ),
  );
  const points: ForecastPoint[] = [];
  const failures: string[] = [];
  const statuses = answers.map((answer, index): ProviderStatus => {
    const { id, sources } = providers[index];
    const label = PROVIDER_LABELS[id] ?? id;
    const status = { id, label, sources, answered: [] as string[] };
    if (answer.status === "fulfilled") {
      points.push(...answer.value);
      const answered = [...new Set(answer.value.map((point) => point.source))];
      return {
        ...status,
        answered,
        state: answered.length ? "answered" : "empty",
      };
    }
    const reason: unknown = answer.reason;
    if (reason instanceof ServiceError && reason.kind === "no-coverage")
      return { ...status, state: "outside" };
    const message = userMessage(reason);
    failures.push(`${label}: ${message}`);
    return { ...status, state: "failed", message };
  });
  return { points, failures, statuses };
}
