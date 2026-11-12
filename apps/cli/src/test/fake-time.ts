// The engine's time and wake-ups for the `routines watch` tests, moved by hand.

import type { Clock } from "@halonicjs/ports";

/**
 * The engine's time, moved by hand, and its wake-ups, which only go off
 * when the test calls {@link FakeTime.wake}: no real timer runs.
 */
export interface FakeTime {
  readonly clock: Clock;
  set(iso: string): void;
  /** Calls every wake-up the scheduler has set, as if its delay had passed. */
  wake(): void;
  setTimer(callback: () => void, delayMs: number): () => void;
}

/** A {@link FakeTime} at `start`, in milliseconds since 1970. */
export function fakeTime(start: number): FakeTime {
  let now = start;
  let wakeUps = new Set<() => void>();
  return {
    clock: { now: () => new Date(now) },
    set: (iso) => {
      now = Date.parse(iso);
    },
    wake: () => {
      const due = wakeUps;
      wakeUps = new Set();
      for (const callback of due) callback();
    },
    setTimer: (callback) => {
      wakeUps.add(callback);
      return () => wakeUps.delete(callback);
    },
  };
}

/**
 * Calls the scheduler's wake-ups, for a `waitUntil` check: the scheduler
 * sets its first one once it has read its timers, so each try wakes it again.
 */
export function wokenUp(time: FakeTime): true {
  time.wake();
  return true;
}
