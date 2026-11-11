// The seventh skip reason (engine answer point 4, HAL-3267; flow-routines
// 3.9): a due time whose target can't be started is recorded as a skip,
// not started as a run that fails at once with "not found". Decided before
// the overlap rule, so a routine whose target can't start never has its
// other due times marked busy, or queued, behind a run that never starts.

import type { RoutineFailure, RoutineTime, ScheduledRun } from "./routine-scheduler.ts";
import type { TargetUnavailableWhy } from "./routine-skips.ts";

/** A due time a tick didn't start because the routine's target can't be started. */
export interface UnavailableTime extends RoutineTime {
  why: TargetUnavailableWhy;
}

/**
 * One tick's checks of whether each routine's target can be started, and
 * what they found. A check that throws fails only its own routine's times,
 * so one broken routine never holds the others back. Without a check, every
 * target can be started.
 */
export class TargetChecks<Run extends ScheduledRun> {
  /** The times to record as `target-unavailable` skips. */
  readonly unavailable: UnavailableTime[] = [];
  /** The times whose check threw; they don't start either. */
  readonly failed: RoutineFailure[] = [];
  readonly #targetUnavailable: ((run: Run) => Promise<TargetUnavailableWhy | null>) | undefined;

  constructor(targetUnavailable: ((run: Run) => Promise<TargetUnavailableWhy | null>) | undefined) {
    this.#targetUnavailable = targetUnavailable;
  }

  /**
   * The due times of one routine that go on to the overlap rule: all of
   * them when its target can be started, none when it can't. A routine with
   * a run going isn't asked: its target was there when that run started,
   * and its times keep the overlap rule's reason. The check is asked once,
   * about the oldest time, since every time of a routine has its target.
   */
  async pass(runs: readonly Run[], busy: boolean): Promise<readonly Run[]> {
    const oldest = runs.reduce<Run | undefined>(
      (found, run) => (found === undefined || run.at < found.at ? run : found),
      undefined,
    );
    if (this.#targetUnavailable === undefined || busy || oldest === undefined) {
      return runs;
    }
    let why: TargetUnavailableWhy | null;
    try {
      why = await this.#targetUnavailable(oldest);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.failed.push(...runs.map((run) => ({ ...timeOf(run), error: failure })));
      return [];
    }
    if (why === null) {
      return runs;
    }
    this.unavailable.push(...runs.map((run) => ({ ...timeOf(run), why })));
    return [];
  }
}

function timeOf(run: ScheduledRun): RoutineTime {
  return { key: run.key, at: run.at.toISOString() };
}
