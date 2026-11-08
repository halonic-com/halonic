import { assert } from "./assert.ts";

/**
 * Tells the current time. Code that needs the time takes a `Clock`, so tests
 * can pass a fixed one and get the same output on every run.
 */
export interface Clock {
  /** The current time. */
  now(): Date;
}

/** The real clock: the time of the machine it runs on. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** The start of `fixedClock` when no start is given: 2026-01-01T00:00:00Z. */
export const fixedClockStart: number = Date.UTC(2026, 0, 1);

/**
 * A clock for tests. The first call returns `start`, and every later call
 * returns a time `stepMs` later than the call before.
 *
 * @param start - the first time, in milliseconds since 1970 (default 2026-01-01T00:00:00Z)
 * @param stepMs - how far the clock moves on per call, zero or more (default 1000)
 * @returns a new clock with its own position
 * @throws AssertionError when `start` or `stepMs` isn't a valid number of milliseconds
 *
 * @example
 * const clock = fixedClock();
 * clock.now().toISOString(); // "2026-01-01T00:00:00.000Z"
 * clock.now().toISOString(); // "2026-01-01T00:00:01.000Z"
 */
export function fixedClock(start: number = fixedClockStart, stepMs = 1000): Clock {
  assert(Number.isFinite(start), `fixedClock needs a finite start time, got ${start}.`);
  assert(
    Number.isFinite(stepMs) && stepMs >= 0,
    `fixedClock needs a step of zero or more milliseconds, got ${stepMs}.`,
  );
  let current = start;
  return {
    now() {
      const time = new Date(current);
      current += stepMs;
      return time;
    },
  };
}
