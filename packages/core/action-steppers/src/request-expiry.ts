/** How long a request stays runnable when nothing shortens it: 24 hours (architecture note, 1.1). */
export const defaultRequestLifetimeMs = 24 * 60 * 60 * 1000;

/** What decides a request's expiry. Times are milliseconds since the epoch; core never reads the clock. */
export interface RequestExpiryInput {
  /** When Halonic received the request. */
  receivedAt: number;
  /** The `expires` the requester asked for, if any. It may only shorten the lifetime. */
  requested?: number;
  /** The definition's own limit on the lifetime, if any, such as GitHub's deployment wait. */
  definitionLimitMs?: number;
}

/**
 * The moment a request stops being runnable: 24 hours after it arrived, or
 * earlier when the definition or the requester says so. Neither can make it
 * later, so a requester can't keep an approval open past the default.
 *
 * @example
 * requestExpiresAt({ receivedAt: 0, definitionLimitMs: 3_600_000 });
 * // => 3_600_000
 */
export function requestExpiresAt(input: RequestExpiryInput): number {
  const limits = [defaultRequestLifetimeMs];
  if (input.definitionLimitMs !== undefined) limits.push(input.definitionLimitMs);
  const latest = input.receivedAt + Math.max(0, Math.min(...limits));
  if (input.requested === undefined) return latest;
  return Math.min(input.requested, latest);
}

/** Whether the stepper may start a request now, and why not. */
export type Runnable = { ok: true } | { ok: false; reason: "closed" | "expired" };

/**
 * Checks a request may run (architecture note, 6.1): a request that already
 * finished is closed and never runs again, and an expired one is refused.
 * Running "the same thing again" means a new request.
 */
export function checkRunnable(
  request: { expiresAt: number; finished: boolean },
  now: number,
): Runnable {
  if (request.finished) return { ok: false, reason: "closed" };
  if (now >= request.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}
