// A run whose step keeps failing must not leave `halonic run` waiting in
// silence (Liam, HAL-4026). The scheduler retries a failed timer by itself,
// so one failure is no news; the same timer failing again and again is a
// stuck run, and the command stops with that error. The failures before
// that are retries that may still work out: `--debug` shows them.
// `halonic routines watch` runs unattended for days, so it reports a stuck
// run and keeps watching instead (HAL-5064). After an hour of failures it
// gives up on that run: each try may pay for a model call (Liam, HAL-5294).

import type { SchedulerErrorSource } from "@halonicjs/adapter-scheduler-node";
import type { Clock, ScheduledTimer } from "@halonicjs/ports";
import type { Phrase } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { printable } from "./output/printable.ts";

/** How often the same timer may fail before the run counts as stuck. */
export const failuresBeforeStuck = 3;

/**
 * How long a stuck run's timer may keep failing, from its first failure in
 * a row, before `routines watch` gives up on the run: an hour, about 14
 * tries with the scheduler's backoff (Liam, HAL-5294).
 */
export const stuckForBeforeGivingUpMs = 60 * 60_000;

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
   * Whether the watch gave up on this timer's run and couldn't cancel it:
   * the engine leaves such a timer untried for as long as it is open.
   */
  holds(timer: ScheduledTimer): boolean;
  /**
   * Aborted, with the last error as its reason, once a timer, the
   * scheduler's wake-up or its tick has failed {@link failuresBeforeStuck}
   * times in a row. With `stuckRuns`, a timer never aborts it.
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

/** What a watch that keeps going past a stuck run does with it, as `routines watch` does. */
export interface StuckRunHandlers {
  /** The engine's clock, which says when an hour of failures is up. */
  readonly clock: Clock;
  /** Hears a timer's third failure in a row, once. */
  onStuck(stuck: StuckTimer): void;
  /** Cancels a run, as the engine's `cancel` does. */
  cancel(runId: string): Promise<unknown>;
  /** Hears that the watch gave up on a run, once, after it tried to cancel it. */
  onGaveUp(gaveUp: GaveUpRun): void;
}

/**
 * A run the watch gave up on: its timer kept failing for
 * {@link stuckForBeforeGivingUpMs}. It was cancelled, or, when that failed
 * too, its timer is held: the run stays as it was, for the next engine.
 */
export type GaveUpRun = StuckTimer &
  ({ readonly cancelled: true } | { readonly cancelled: false; readonly cancelError: unknown });

/**
 * Counts each timer's failures, and the scheduler's own wake-up and tick
 * failures, and aborts `signal` with the error at the third of any one in
 * a row: {@link StuckTimerWatch.succeeded} starts a source's count again.
 * Each failure before that goes to `onRetry`, so `--debug` can show a run
 * that is retrying before it counts as stuck. Given `stuckRuns`, a timer's
 * third failure goes to its `onStuck` instead, once, and `signal` stays as
 * it is: the scheduler keeps retrying that timer, and the other runs go on.
 * Once that timer has kept failing for {@link stuckForBeforeGivingUpMs}, the
 * watch gives up on its run: it cancels it, or holds the timer when that
 * fails too, and tells `onGaveUp`. A timer that works again starts over.
 *
 * @example
 * const stuck = stuckTimerWatch((failure) => context.debug(lineOf(failure)));
 * await openLocalEngine({ …, reportError: stuck.report });
 * await workflowRuns.follow(runId, { signal: AbortSignal.any([context.signal, stuck.signal]) });
 */
export function stuckTimerWatch(
  onRetry: (failure: RetriedFailure) => void = () => {},
  stuckRuns?: StuckRunHandlers,
): StuckTimerWatch {
  const stuck = new AbortController();
  const failures = new Map<string, { count: number; since: number }>();
  /** The timers whose runs the watch gave up on, and those of them it holds. */
  const gaveUp = new Set<string>();
  const held = new Set<string>();
  /** A stuck timer's failure, its third in a row or later: a ✕ line, and after an hour giving up. */
  const keptFailing = (handlers: StuckRunHandlers, key: string, timer: StuckTimer) => {
    const failure = failures.get(key);
    if (failure?.count === failuresBeforeStuck) handlers.onStuck(timer);
    if (handlers.clock.now().getTime() - (failure?.since ?? 0) >= stuckForBeforeGivingUpMs) {
      gaveUp.add(key);
      void giveUp(handlers, timer, () => held.add(key));
    }
  };
  return {
    signal: stuck.signal,
    report(error, source) {
      const key = keyOf(source);
      if (gaveUp.has(key)) return;
      const failure = failures.get(key) ?? {
        count: 0,
        since: stuckRuns?.clock.now().getTime() ?? 0,
      };
      failure.count += 1;
      failures.set(key, failure);
      if (failure.count < failuresBeforeStuck) {
        onRetry({ error, source, failures: failure.count });
      } else if (typeof source !== "string" && stuckRuns !== undefined) {
        keptFailing(stuckRuns, key, { error, timer: source });
      } else if (!stuck.signal.aborted) {
        stuck.abort(error);
      }
    },
    succeeded(source) {
      const key = keyOf(source);
      failures.delete(key);
      gaveUp.delete(key);
      held.delete(key);
    },
    holds(timer) {
      return held.has(keyOf(timer));
    },
  };
}

/** Cancels a stuck run, or holds its timer when that fails too, then says which. Never rejects. */
async function giveUp(
  { cancel, onGaveUp }: StuckRunHandlers,
  stuck: StuckTimer,
  hold: () => void,
): Promise<void> {
  try {
    await cancel(stuck.timer.key);
  } catch (cancelError) {
    hold();
    onGaveUp({ ...stuck, cancelled: false, cancelError });
    return;
  }
  onGaveUp({ ...stuck, cancelled: true });
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
