// Enforces the start limits of harness calls with the `Scheduler` port: each
// start sets a timer for when its time is up, and the timer ends the wait
// if the start is still going. Core has no timers of its own, and the
// scheduler delivers timers while a harness call runs, so this works the
// same on every runtime.

import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import type { StartLimit, StartLimits } from "../harness/start-limits.ts";

/** The prefix of a start limit's timer id: `start:<phase>:<callId>`. */
const startTimer = "start:";

/** The start limits of every harness call this engine is running. */
export class StartDeadlines {
  readonly #scheduler: Scheduler;
  readonly #clock: Clock;
  /** Ends each start still waiting, by its timer's slot. */
  readonly #waiting = new Map<string, () => void>();

  constructor(scheduler: Scheduler, clock: Clock) {
    this.#scheduler = scheduler;
    this.#clock = clock;
  }

  /** Whether the timer is a start limit's. */
  static owns(timer: ScheduledTimer): boolean {
    return timer.timerId.startsWith(startTimer);
  }

  /** The limits of one harness call of a run. */
  of(runId: string, callId: string): StartLimits {
    return { within: (limit) => this.#within(runId, callId, limit) };
  }

  /**
   * A start limit's time is up: ends the wait if the start is still going.
   * A timer that is late or repeated, or whose call this engine isn't
   * running (after a restart, say), changes nothing.
   */
  expire(timer: ScheduledTimer): void {
    this.#waiting.get(slot(timer.key, timer.timerId))?.();
  }

  async #within<T>(runId: string, callId: string, limit: StartLimit<T>): Promise<T> {
    const timerId = `${startTimer}${limit.phase}:${callId}`;
    const timerSlot = slot(runId, timerId);
    let timeUp = () => {};
    const expired = new Promise<"expired">((resolve) => {
      timeUp = () => resolve("expired");
    });
    this.#waiting.set(timerSlot, timeUp);
    try {
      const due = new Date(this.#clock.now().getTime() + limit.timeoutMs).toISOString();
      await this.#scheduler.schedule(runId, timerId, due);
      const work = limit.start();
      const first = await Promise.race([work.then((value) => ({ value })), expired]);
      if (first !== "expired") return first.value;
      stopWhenItArrives(work, limit);
      throw limit.timedOut();
    } finally {
      this.#waiting.delete(timerSlot);
      await this.#scheduler.cancel(runId, timerId).catch(() => {
        // A timer left set finds no wait when it arrives, and changes nothing.
      });
    }
  }
}

/**
 * Stops what a start gives after its time was up. Its failure, or the
 * start's own, has no one left to tell: the call has already failed.
 */
function stopWhenItArrives<T>(work: Promise<T>, limit: StartLimit<T>): void {
  work.then((value) => limit.late?.(value)).catch(() => {});
}

/** One map key per run and timer id; JSON keeps `a` + `b:c` apart from `a:b` + `c`. */
function slot(runId: string, timerId: string): string {
  return JSON.stringify([runId, timerId]);
}
