import type { Clock } from "@halonicjs/ports";

/** 2026-01-01T00:00:00Z, where a {@link ManualClock} starts unless told otherwise. */
export const manualClockStart = "2026-01-01T00:00:00.000Z";

/**
 * A clock that moves only when told to: for kernel tests, the parity
 * harness and the demo's time travel. The scheduler and coordination
 * adapters read their time from it, so a test can make a lease run out or a
 * timer fall due without waiting.
 */
export class ManualClock implements Clock {
  #time: number;

  /**
   * @param start - the first time, as an ISO string
   * @throws RangeError when `start` isn't a valid time
   */
  constructor(start: string = manualClockStart) {
    this.#time = parseTime(start);
  }

  now(): Date {
    return new Date(this.#time);
  }

  /**
   * Moves the clock forward.
   *
   * @throws RangeError when `ms` is negative or not a finite number
   */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError(`A manual clock only moves forward, not by ${ms} ms.`);
    }
    this.#time += ms;
  }

  /**
   * Sets the clock to a time, which may be earlier: a test of a clock that
   * jumps back, for example.
   *
   * @throws RangeError when `at` isn't a valid time
   */
  set(at: string): void {
    this.#time = parseTime(at);
  }
}

function parseTime(at: string): number {
  const time = Date.parse(at);
  if (Number.isNaN(time)) {
    throw new RangeError(`${JSON.stringify(at)} is not a valid time.`);
  }
  return time;
}
