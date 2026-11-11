// The seventh skip reason (engine answer point 4, HAL-3267; flow-routines
// 3.9): a due time whose target can't be started is recorded as a skip,
// not started as a run that fails at once with "not found". Decided before
// the overlap rule, so a routine whose target can't start never has its
// other due times marked busy, or queued, behind a run that never starts.

import { applyOverlap, type OverlapDecision, type RoutineOverlap } from "./routine-overlap.ts";
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
   * What the overlap rule does with one routine's due times, once they are
   * checked: none go on when its target can't be started.
   *
   * @param busy - whether a run of the routine is running or waiting
   */
  async decide(
    overlap: RoutineOverlap,
    busy: boolean,
    runs: readonly Run[],
  ): Promise<OverlapDecision<Run>> {
    const passed = await this.#pass(runs, busy && overlap !== "allow");
    return applyOverlap(overlap, busy, passed);
  }

  /**
   * The due times of one routine that go on to the overlap rule: all of
   * them when its target can be started, none when it can't. A routine whose
   * overlap rule starts nothing this tick (a run going, and `skip` or
   * `queue`) isn't asked, so its times keep that rule's reason. The check is
   * asked once, about the oldest time, since every time of a routine has its
   * target.
   *
   * @param startsNothing - whether the overlap rule would start none of `runs`
   */
  async #pass(runs: readonly Run[], startsNothing: boolean): Promise<readonly Run[]> {
    if (this.#targetUnavailable === undefined || startsNothing || runs.length === 0) {
      return runs;
    }
    const oldest = runs.reduce((found, run) => (run.at < found.at ? run : found));
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

  /**
   * Puts what the checks found oldest first across routines, as the tick's
   * starts are; `decide` is asked one routine at a time.
   */
  sortOldestFirst(): void {
    this.unavailable.sort(byTime);
    this.failed.sort(byTime);
  }
}

/** Orders times oldest first. */
function byTime(first: RoutineTime, second: RoutineTime): number {
  return Date.parse(first.at) - Date.parse(second.at);
}

function timeOf(run: ScheduledRun): RoutineTime {
  return { key: run.key, at: run.at.toISOString() };
}
