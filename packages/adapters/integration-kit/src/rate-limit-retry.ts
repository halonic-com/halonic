import { maxIntegrationWaitMs, retryDelayMs } from "./integration/index.ts";

/** The kit sends a request at most three times: once, then retried twice. */
const maxRetries = 2;

/** All the waits before one request's retries together, at most: the longest `IntegrationHost.wait`. */
const maxRetryWaitMs = maxIntegrationWaitMs;

/**
 * The wait before the kit's own retry number `retry` (1 for the first) of a
 * request that got `response`, or `undefined` when the kit doesn't retry it:
 * the status isn't `429`, the method may change something, both retries are
 * used up, or the wait would take the request's waits past 30 s.
 */
export function rateLimitRetryMs(
  method: string,
  response: Response,
  retry: number,
  waitedMs: number,
  now: number,
): number | undefined {
  const repeatable = method === "GET" || method === "HEAD";
  if (response.status !== 429 || !repeatable || retry > maxRetries) return undefined;
  const waitMs = retryDelayMs(response.headers, retry, now);
  return waitedMs + waitMs <= maxRetryWaitMs ? waitMs : undefined;
}
