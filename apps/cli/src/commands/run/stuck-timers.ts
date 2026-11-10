// A run whose step keeps failing must not leave `halonic run` waiting in
// silence (Liam, HAL-4026). The scheduler retries a failed timer by itself,
// so one failure is no news; the same timer failing again and again is a
// stuck run, and the command stops with that error.

import type { SchedulerErrorSource } from "@halonicjs/adapter-scheduler-node";

/** How often the same timer may fail before the run counts as stuck. */
export const failuresBeforeStuck = 3;

/** Watches the scheduler's errors for a timer that keeps failing. */
export interface StuckTimerWatch {
  /** Pass it as the engine's `reportError`. */
  report(error: unknown, source: SchedulerErrorSource): void;
  /** Aborted, with the last error as its reason, once a timer has failed {@link failuresBeforeStuck} times. */
  readonly signal: AbortSignal;
}

/**
 * Counts each timer's failures, and the scheduler's own wake-up and tick
 * failures, and aborts `signal` with the error at the third of any one.
 *
 * @example
 * const stuck = stuckTimerWatch();
 * await openLocalEngine({ …, reportError: stuck.report });
 * await workflowRuns.follow(runId, { signal: AbortSignal.any([context.signal, stuck.signal]) });
 */
export function stuckTimerWatch(): StuckTimerWatch {
  const stuck = new AbortController();
  const failures = new Map<string, number>();
  return {
    signal: stuck.signal,
    report(error, source) {
      const key = typeof source === "string" ? source : `${source.key}\u0000${source.timerId}`;
      const count = (failures.get(key) ?? 0) + 1;
      failures.set(key, count);
      if (count >= failuresBeforeStuck && !stuck.signal.aborted) {
        stuck.abort(error);
      }
    },
  };
}
