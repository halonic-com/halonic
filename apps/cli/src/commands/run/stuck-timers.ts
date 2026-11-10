// A run whose step keeps failing must not leave `halonic run` waiting in
// silence (Liam, HAL-4026). The scheduler retries a failed timer by itself,
// so one failure is no news; the same timer failing again and again is a
// stuck run, and the command stops with that error. The failures before
// that are retries that may still work out: `--debug` shows them.

import type { SchedulerErrorSource } from "@halonicjs/adapter-scheduler-node";
import type { Phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";

/** How often the same timer may fail before the run counts as stuck. */
export const failuresBeforeStuck = 3;

/** Watches the scheduler's errors for a timer that keeps failing. */
export interface StuckTimerWatch {
  /** Pass it as the engine's `reportError`. */
  report(error: unknown, source: SchedulerErrorSource): void;
  /** Aborted, with the last error as its reason, once a timer has failed {@link failuresBeforeStuck} times. */
  readonly signal: AbortSignal;
}

/** A failure the scheduler will try again: not yet {@link failuresBeforeStuck}. */
export interface RetriedFailure {
  readonly error: unknown;
  readonly source: SchedulerErrorSource;
  /** How often this timer has failed now, from 1. */
  readonly failures: number;
}

/**
 * Counts each timer's failures, and the scheduler's own wake-up and tick
 * failures, and aborts `signal` with the error at the third of any one.
 * Each failure before that goes to `onRetry`, so `--debug` can show a run
 * that is retrying before it counts as stuck.
 *
 * @example
 * const stuck = stuckTimerWatch((failure) => context.debug(lineOf(failure)));
 * await openLocalEngine({ …, reportError: stuck.report });
 * await workflowRuns.follow(runId, { signal: AbortSignal.any([context.signal, stuck.signal]) });
 */
export function stuckTimerWatch(
  onRetry: (failure: RetriedFailure) => void = () => {},
): StuckTimerWatch {
  const stuck = new AbortController();
  const failures = new Map<string, number>();
  return {
    signal: stuck.signal,
    report(error, source) {
      const key = typeof source === "string" ? source : `${source.key}\u0000${source.timerId}`;
      const count = (failures.get(key) ?? 0) + 1;
      failures.set(key, count);
      if (count < failuresBeforeStuck) {
        onRetry({ error, source, failures: count });
      } else if (!stuck.signal.aborted) {
        stuck.abort(error);
      }
    },
  };
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
