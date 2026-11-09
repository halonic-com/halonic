/**
 * An `every` trigger fires at whole multiples of its interval counted from
 * the Unix epoch in UTC, so every tick and every caller sees the same times
 * whatever the last run was.
 */

/** The first slot strictly after `after`. */
export function slotAfter(intervalMs: number, after: number): number {
  return (Math.floor(after / intervalMs) + 1) * intervalMs;
}

/** The last slot at or before `atOrBefore`. */
export function slotAtOrBefore(intervalMs: number, atOrBefore: number): number {
  return Math.floor(atOrBefore / intervalMs) * intervalMs;
}
