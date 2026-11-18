// Enforces the start limits of harness calls, their running time once
// started, and the time limit of a connector call a run makes, with the
// `Scheduler` port: each wait sets a
// timer for when its time is up, and the timer ends the wait if it is
// still going. Core has no timers of its own, and the
// scheduler delivers timers while a harness call runs, so this works the
// same on every runtime.

import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import type { RunningLimit, StartLimit, StartLimits } from "../harness/start-limits.ts";

/**
 * The prefix of a limit's timer id: `start:<phase>:<callId>`, `start:step:<callId>` for a
 * harness call's running time, or `start:connector:<callId>`.
 */
const startTimer = "start:";

/** A wait with a time limit that isn't one of a harness call's starts. */
export type TimeLimit<T> = Omit<StartLimit<T>, "phase">;

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
    return {
      within: (limit) => this.#within(runId, `${startTimer}${limit.phase}:${callId}`, limit),
      running: (timeoutMs, timeUp) =>
        this.#running(runId, `${startTimer}step:${callId}`, timeoutMs, timeUp),
    };
  }

  /**
   * Waits for a connector call of a run, as `connector.started` gave its
   * limit.
   *
   * @throws the error of `limit.timedOut()` when the time is up first
   * @throws what `limit.start()` throws
   */
  connectorCall<T>(runId: string, callId: string, limit: TimeLimit<T>): Promise<T> {
    return this.#within(runId, `${startTimer}connector:${callId}`, limit);
  }

  /**
   * A start limit's time is up: ends the wait if the start is still going.
   * A timer that is late or repeated, or whose call this engine isn't
   * running (after a restart, say), changes nothing.
   */
  expire(timer: ScheduledTimer): void {
    this.#waiting.get(slot(timer.key, timer.timerId))?.();
  }

  /**
   * A call's running-time limit: one timer, cancelled on `pause()` and set
   * again on `resume()` for the time that was left. `timeUp` runs at most
   * once, and never after `pause()` or `end()`.
   */
  async #running(
    runId: string,
    timerId: string,
    timeoutMs: number,
    timeUp: () => void,
  ): Promise<RunningLimit> {
    const timerSlot = slot(runId, timerId);
    let leftMs = timeoutMs;
    /** When the stretch being counted began, in milliseconds; `null` while nothing is counted. */
    let since: number | null = null;
    let over = false;
    const count = async () => {
      if (since !== null || over) return;
      since = this.#clock.now().getTime();
      this.#waiting.set(timerSlot, () => {
        over = true;
        this.#waiting.delete(timerSlot);
        timeUp();
      });
      try {
        await this.#scheduler.schedule(runId, timerId, new Date(since + leftMs).toISOString());
      } catch (error) {
        // No timer was set, so nothing is counted and no wait is left behind.
        since = null;
        this.#waiting.delete(timerSlot);
        throw error;
      }
    };
    const stopCounting = async () => {
      if (since === null) return;
      leftMs = Math.max(0, leftMs - (this.#clock.now().getTime() - since));
      since = null;
      this.#waiting.delete(timerSlot);
      await this.#scheduler.cancel(runId, timerId).catch(() => {
        // A timer left set finds no wait when it arrives, and changes nothing.
      });
    };
    await count();
    return {
      pause: stopCounting,
      resume: count,
      end: async () => {
        over = true;
        await stopCounting();
      },
    };
  }

  async #within<T>(runId: string, timerId: string, limit: TimeLimit<T>): Promise<T> {
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
function stopWhenItArrives<T>(work: Promise<T>, limit: TimeLimit<T>): void {
  work.then((value) => limit.late?.(value)).catch(() => {});
}

/** One map key per run and timer id; JSON keeps `a` + `b:c` apart from `a:b` + `c`. */
function slot(runId: string, timerId: string): string {
  return JSON.stringify([runId, timerId]);
}
