import type { SchedulerListener } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import type { StoredTimer, TimerTable } from "./timer-table.ts";

/** What {@link TimerDelivery} needs besides the timers. */
export interface TimerDeliveryOptions {
  table: TimerTable;
  listener: Pick<SchedulerListener, "onTimer">;
  clock: Clock;
  /**
   * Waits about `ms` and resolves, or gives up when `signal` aborts. A
   * Durable Object uses {@link napFor}; a test that moves its own clock
   * wakes the loop when the clock has moved.
   */
  nap: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Waits `ms` with `setTimeout`, and stops waiting at once when `signal` aborts. */
export function napFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Delivers due timers while an alarm runs. A Durable Object never runs two
 * alarms at once, so a timer that comes due while another timer's call is
 * still running would wait for that call. The `Scheduler` port promises
 * otherwise (a harness call's start limit is a timer that has to arrive
 * during the call's own), so the loop keeps going: it starts every timer that
 * is due, then waits for a call to end or the next timer to come due, and
 * looks again. It ends when no call is running and nothing is due.
 */
export class TimerDelivery {
  readonly #options: TimerDeliveryOptions;

  constructor(options: TimerDeliveryOptions) {
    this.#options = options;
  }

  /** Delivers timers until none is due and no call is running. */
  async deliverDueTimers(): Promise<void> {
    const { table, clock, nap } = this.#options;
    const running = new Map<string, Promise<void>>();
    for (;;) {
      const nowMs = clock.now().getTime();
      for (const timer of table.due(nowMs)) {
        const id = JSON.stringify([timer.key, timer.timerId]);
        if (!running.has(id)) {
          running.set(
            id,
            this.#deliver(timer).finally(() => running.delete(id)),
          );
        }
      }
      if (running.size === 0) return;
      const nextDueMs = table.earliestDueAfter(nowMs);
      const stopNapping = new AbortController();
      const waits = [...running.values()];
      if (nextDueMs !== null) waits.push(nap(nextDueMs - nowMs, stopNapping.signal));
      await Promise.race(waits);
      stopNapping.abort();
    }
  }

  /** Calls the listener once and records how it ended. Never rejects. */
  async #deliver(timer: StoredTimer): Promise<void> {
    const { table, listener, clock } = this.#options;
    let delivered = true;
    try {
      await listener.onTimer({ key: timer.key, timerId: timer.timerId, at: timer.at });
    } catch {
      delivered = false;
    }
    table.finish(timer, delivered, clock.now().getTime());
  }
}
