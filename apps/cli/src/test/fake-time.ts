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
  /** The engine's `onWokeUp`: hears that a wake-up's deliveries and tick have settled. */
  onWokeUp(): void;
  /**
   * Waits until the scheduler has set a wake-up, calls it, and resolves once
   * that wake-up's deliveries and tick have settled, so what the tick prints
   * is there, however long the run's start took (HAL-21122).
   */
  wakeAndSettle(): Promise<void>;
}

/** A {@link FakeTime} at `start`, in milliseconds since 1970. */
export function fakeTime(start: number): FakeTime {
  let now = start;
  let wakeUps = new Set<() => void>();
  // Who waits for the scheduler to set its next wake-up, and for a wake-up to settle.
  let wakeUpSet: (() => void) | undefined;
  let settled: (() => void) | undefined;
  const wake = () => {
    const due = wakeUps;
    wakeUps = new Set();
    for (const callback of due) callback();
  };
  return {
    clock: { now: () => new Date(now) },
    set: (iso) => {
      now = Date.parse(iso);
    },
    wake,
    setTimer: (callback) => {
      wakeUps.add(callback);
      wakeUpSet?.();
      return () => wakeUps.delete(callback);
    },
    onWokeUp: () => settled?.(),
    wakeAndSettle: async () => {
      // The scheduler sets none while a tick runs, nor before it has read its timers.
      if (wakeUps.size === 0) {
        await new Promise<void>((resolve) => {
          wakeUpSet = resolve;
        });
        wakeUpSet = undefined;
      }
      const settling = new Promise<void>((resolve) => {
        settled = resolve;
      });
      wake();
      await settling;
      settled = undefined;
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
