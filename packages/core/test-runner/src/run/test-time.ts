// A test case's time: a clock that moves only when the case says so, and a
// scheduler that delivers the timers due on it.

import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";

/** A clock that stands still until {@link TestClock.advance} moves it on. */
export class TestClock implements Clock {
  #now: number;

  constructor(start: Date) {
    this.#now = start.getTime();
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now += ms;
  }

  /** Moves the clock on to `time`; a time already past leaves it where it is. */
  advanceTo(time: number): void {
    this.#now = Math.max(this.#now, time);
  }
}

/**
 * Keeps the timers runs set, and delivers those due on the test clock when
 * the case asks. A run moves on one step per timer, so delivering what is
 * due until nothing is runs every run as far as it goes at this time.
 */
export class TestScheduler implements Scheduler {
  readonly #timers = new Map<string, ScheduledTimer>();
  readonly #clock: Clock;
  /** Where due timers go: the executor's `onTimer`, set once the executor exists. */
  onTimer: (timer: ScheduledTimer) => Promise<void> = async () => {};

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.#timers.set(slot(key, timerId), { key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.#timers.delete(slot(key, timerId));
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.#timers.values()].filter((timer) => timer.key === key);
  }

  /**
   * Delivers the timers due now, earliest first, and those they set that are
   * due too, until none is due. Gives up after `limit` deliveries, so a run
   * that never stops setting due timers can't hang the test.
   *
   * @returns false when it gave up
   */
  async runDue(limit = 10_000): Promise<boolean> {
    for (let delivered = 0; delivered < limit; delivered++) {
      const next = this.#nextDue();
      if (next === undefined) return true;
      this.#timers.delete(slot(next.key, next.timerId));
      await this.onTimer(next);
    }
    return this.#nextDue() === undefined;
  }

  /** When the earliest pending timer is due, or `undefined` when none is pending. */
  nextAt(): number | undefined {
    const next = this.#earliest();
    return next === undefined ? undefined : Date.parse(next.at);
  }

  #nextDue(): ScheduledTimer | undefined {
    const next = this.#earliest();
    if (next === undefined || Date.parse(next.at) > this.#clock.now().getTime()) return undefined;
    return next;
  }

  #earliest(): ScheduledTimer | undefined {
    let next: ScheduledTimer | undefined;
    for (const timer of this.#timers.values()) {
      if (next === undefined || Date.parse(timer.at) < Date.parse(next.at)) next = timer;
    }
    return next;
  }
}

function slot(key: string, timerId: string): string {
  return JSON.stringify([key, timerId]);
}
