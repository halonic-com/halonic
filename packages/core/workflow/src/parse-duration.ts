const MINUTE = 60_000;

/** The duration units and how long one of each lasts, in milliseconds. */
const UNIT_MS = {
  m: MINUTE,
  h: 60 * MINUTE,
  d: 24 * 60 * MINUTE,
} as const;

type DurationUnit = keyof typeof UNIT_MS;

/** A count of 1 or more without leading zeros, then one unit letter, and nothing around it. */
const DURATION = /^([1-9]\d*)(m|h|d)$/;

/**
 * Reads the delay of a timer transition (`after: "30m"`), such as `"30m"`,
 * `"4h"` or `"2d"`, and returns its length in milliseconds.
 *
 * The text must be exactly the count and the unit: unlike `parseEvery` in
 * `@halonicjs/routines`, spaces around it are not ignored.
 *
 * @throws {Error} `Bad duration "<text>"` when the text is not a count of 1
 * or more followed by `m`, `h` or `d`
 *
 * @example
 * parseDuration("30m"); // 1_800_000
 * parseDuration("2d"); // 172_800_000
 */
export function parseDuration(text: string): number {
  const match = DURATION.exec(text);
  if (!match) {
    throw new Error(`Bad duration "${text}"`);
  }
  const [, count, unit] = match;
  return Number(count) * UNIT_MS[unit as DurationUnit];
}
