/**
 * How long to wait before sending a request again after `429 Too Many
 * Requests`. The kit's HTTP client uses it to retry a `GET` or `HEAD` by
 * itself; an integration that retries more, such as a `5xx`, uses the same
 * waits.
 */

/** The wait before the first retry when the server asks for none; it doubles for the second. */
const firstBackoffMs = 1_000;

/**
 * The milliseconds to wait before retry number `retry` (1 for the first):
 * as long as the response's `retry-after` asks, or 1 s, then 2 s, when it
 * asks nothing that can be read. It isn't capped: the caller decides how
 * long is too long.
 *
 * `retry-after` is seconds or an HTTP date (RFC 9110, section 10.2.3). A
 * date is measured against the response's own `date` header, so the
 * server's clock is compared with the server's clock. Without a `date`
 * header it's measured against `now`, the local clock.
 *
 * @example
 * const waitMs = retryDelayMs(response.headers, 1, Date.now());
 */
export function retryDelayMs(headers: Headers, retry: number, now: number): number {
  return askedWaitMs(headers, now) ?? firstBackoffMs * 2 ** (retry - 1);
}

/** The wait `retry-after` asks for in milliseconds, at least 0, or `undefined` when it can't be read. */
function askedWaitMs(headers: Headers, now: number): number | undefined {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter === undefined) return undefined;
  if (/^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  const until = parseHttpDate(retryAfter);
  if (until === undefined) return undefined;
  const sent = parseHttpDate(headers.get("date") ?? "") ?? now;
  return Math.max(0, until - sent);
}

/** An HTTP date in milliseconds since 1970, or `undefined` when it isn't one. */
function parseHttpDate(value: string): number | undefined {
  const text = value.trim();
  // Every HTTP date format starts with the day's name. Checking that first
  // keeps Date.parse from reading text such as "-5" as a year.
  if (!/^[a-z]{3}/i.test(text)) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : time;
}
