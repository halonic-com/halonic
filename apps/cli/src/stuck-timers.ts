// A run whose step keeps failing must not leave `halonic run` waiting in
// silence (Liam, HAL-4026). The scheduler retries a failed timer by itself,
// so one failure is no news; the same timer failing again and again is a
// stuck run, and the command stops with that error. The failures before
// that are retries that may still work out: `--debug` shows them.
// `halonic routines watch` runs unattended for days, so it reports a stuck
// run and keeps watching instead (HAL-5064).

import type { SchedulerErrorSource } from "@halonicjs/adapter-scheduler-node";
import type { ScheduledTimer } from "@halonicjs/ports";
import type { Phrase } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { printable } from "./output/printable.ts";

/** How often the same timer may fail before the run counts as stuck. */
export const failuresBeforeStuck = 3;

/** Watches the scheduler's errors for a timer that keeps failing. */
export interface StuckTimerWatch {
  /** Pass it as the engine's `reportError`. */
  report(error: unknown, source: SchedulerErrorSource): void;
  /**
   * Forgets the failures of `source` once it worked again, so only failures
   * in a row count: a long `routines watch` isn't stopped by three tick
   * errors days apart.
   */
  succeeded(source: SchedulerErrorSource): void;
  /**
   * Aborted, with the last error as its reason, once a timer, the
   * scheduler's wake-up or its tick has failed {@link failuresBeforeStuck}
   * times in a row. With `onStuck`, a timer never aborts it.
   */
  readonly signal: AbortSignal;
}

/** A failure the scheduler will try again: not yet {@link failuresBeforeStuck}. */
export interface RetriedFailure {
  readonly error: unknown;
  readonly source: SchedulerErrorSource;
  /** How often this timer has failed now, from 1. */
  readonly failures: number;
}

/** A timer that failed {@link failuresBeforeStuck} times in a row: its run is stuck. */
export interface StuckTimer {
  /** The last error. */
  readonly error: unknown;
  /** The timer; its key is the run's id. */
  readonly timer: ScheduledTimer;
}

/**
 * Counts each timer's failures, and the scheduler's own wake-up and tick
 * failures, and aborts `signal` with the error at the third of any one in
 * a row: {@link StuckTimerWatch.succeeded} starts a source's count again.
 * Each failure before that goes to `onRetry`, so `--debug` can show a run
 * that is retrying before it counts as stuck. Given `onStuck`, a timer's
 * third failure goes there instead, once, and `signal` stays as it is: the
 * scheduler keeps retrying that timer, and the other runs go on.
 *
 * @example
 * const stuck = stuckTimerWatch((failure) => context.debug(lineOf(failure)));
 * await openLocalEngine({ …, reportError: stuck.report });
 * await workflowRuns.follow(runId, { signal: AbortSignal.any([context.signal, stuck.signal]) });
 */
export function stuckTimerWatch(
  onRetry: (failure: RetriedFailure) => void = () => {},
  onStuck?: (stuck: StuckTimer) => void,
): StuckTimerWatch {
  const stuck = new AbortController();
  const failures = new Map<string, number>();
  return {
    signal: stuck.signal,
    report(error, source) {
      const key = keyOf(source);
      const count = (failures.get(key) ?? 0) + 1;
      failures.set(key, count);
      if (count < failuresBeforeStuck) {
        onRetry({ error, source, failures: count });
      } else if (typeof source !== "string" && onStuck !== undefined) {
        if (count === failuresBeforeStuck) onStuck({ error, timer: source });
      } else if (!stuck.signal.aborted) {
        stuck.abort(error);
      }
    },
    succeeded(source) {
      failures.delete(keyOf(source));
    },
  };
}

function keyOf(source: SchedulerErrorSource): string {
  return typeof source === "string" ? source : `${source.key}\u0000${source.timerId}`;
}

/**
 * "the engine's timer call:draft of run_a failed, try 2 of 3, retrying: refused", for
 * `--debug`. `runCli` removes every loaded secret from it.
 */
export function retriedLine({ error, source, failures }: RetriedFailure): Phrase {
  const reason = printable(error instanceof Error ? error.message : String(error));
  if (typeof source === "string") {
    return runMessages.schedulerRetried(source, failures, failuresBeforeStuck, reason).phrase;
  }
  return runMessages.timerRetried(
    printable(source.timerId),
    printable(source.key),
    failures,
    failuresBeforeStuck,
    reason,
  ).phrase;
}
