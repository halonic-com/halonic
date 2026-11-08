import { CronError } from "./cron-error.ts";

const MINUTE = 60_000;

/** The interval units and how long one of each lasts, in milliseconds. */
const UNIT_MS = {
  m: MINUTE,
  h: 60 * MINUTE,
  d: 24 * 60 * MINUTE,
} as const;

type IntervalUnit = keyof typeof UNIT_MS;

/** A count of 1 or more without leading zeros, then one unit letter. */
const INTERVAL = /^([1-9]\d*)(m|h|d)$/;

/**
 * Reads an interval such as `"15m"`, `"2h"` or `"1d"` and returns its length
 * in milliseconds. Spaces around the text are ignored.
 *
 * @throws {CronError} when the text is not a count of 1 or more followed by
 * `m`, `h` or `d`
 *
 * @example
 * parseEvery("15m"); // 900_000
 * parseEvery(" 1d "); // 86_400_000
 */
export function parseEvery(text: string): number {
  const match = INTERVAL.exec(text.trim());
  if (!match) {
    throw new CronError(`"${text}" is not an interval; use e.g. "15m", "1h", "1d"`);
  }
  const [, count, unit] = match;
  return Number(count) * UNIT_MS[unit as IntervalUnit];
}
