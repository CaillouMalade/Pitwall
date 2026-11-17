// A JSON GET with a timeout, the status checks and one clear message per failure.
// The messages are fixed text on purpose: a network error's own text can contain
// the full URL, and nothing from it should reach the page.

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** A failure with a message written for the user, safe to show as is. */
export class ServiceError extends Error {
  readonly kind: FailureKind;
  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = "ServiceError";
    this.kind = kind;
  }
}

export type FailureKind =
  | "timeout"
  | "offline"
  | "rejected"
  | "not-found"
  | "rate-limited"
  | "server"
  | "status"
  | "unreadable"
  | "format"
  | "input";

export const TIMEOUT_MS = 10_000;

export const MESSAGES = {
  timeout: "The weather service took too long to respond. Please try again.",
  offline:
    "Could not connect to the weather service. Check your internet connection.",
  failed: "The request to the weather service failed. Please try again.",
  badRequest:
    "The weather service did not accept the request. Check the location's coordinates.",
  refused: (status: number) =>
    `The weather service refused the request (status ${status}).`,
  notFound: "The requested resource was not found.",
  rateLimited:
    "Too many requests to the weather service. Wait a minute and try again.",
  server: (status: number) =>
    `The weather service has a problem on its side (status ${status}). Try again later.`,
  status: (status: number) => `The weather service returned status ${status}.`,
  unreadable: "The weather service sent a response that could not be read.",
};

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  notFoundMessage?: string;
  fetch?: FetchLike;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function getJson(
  url: string,
  options: GetOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  if (isOffline()) throw new ServiceError("offline", MESSAGES.offline);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError")
      throw new ServiceError("timeout", MESSAGES.timeout);
    // fetch rejects with a TypeError when the network cannot be reached.
    if (error instanceof TypeError || isOffline())
      throw new ServiceError("offline", MESSAGES.offline);
    throw new ServiceError("offline", MESSAGES.failed);
  }

  const { status } = response;
  if (status === 400) throw new ServiceError("rejected", MESSAGES.badRequest);
  if (status === 401 || status === 403)
    throw new ServiceError("rejected", MESSAGES.refused(status));
  if (status === 404)
    throw new ServiceError(
      "not-found",
      options.notFoundMessage ?? MESSAGES.notFound,
    );
  if (status === 429)
    throw new ServiceError("rate-limited", MESSAGES.rateLimited);
  if (status >= 500) throw new ServiceError("server", MESSAGES.server(status));
  if (status !== 200) throw new ServiceError("status", MESSAGES.status(status));

  try {
    return await response.json();
  } catch {
    throw new ServiceError("unreadable", MESSAGES.unreadable);
  }
}

/** The message to show for any failure; never the raw text of an unknown error. */
export function userMessage(error: unknown): string {
  return error instanceof ServiceError ? error.message : MESSAGES.failed;
}
