// The seventh skip reason (engine answer point 4, HAL-3267; flow-routines
// 3.9): a due time whose target can't be started is recorded as a skip,
// not started as a run that fails at once with "not found". Decided when
// the run would start, after the tick's own skip reasons.

import type { RoutineFailure, RoutineTime, ScheduledRun } from "./routine-scheduler.ts";
import type { TargetUnavailableWhy } from "./routine-skips.ts";

/** A due time a tick didn't start because the routine's target can't be started. */
export interface UnavailableTime extends RoutineTime {
  why: TargetUnavailableWhy;
}

/** The runs a tick would start, split by whether their target can be started. */
export interface CheckedTargets<Run extends ScheduledRun> {
  /** The runs to start, in the order given. */
  readonly start: Run[];
  /** The times to record as `target-unavailable` skips. */
  readonly unavailable: UnavailableTime[];
  /** The runs whose check threw; they don't start either. */
  readonly failed: RoutineFailure[];
}

/**
 * Asks `targetUnavailable` about each run a tick would start. A check that
 * throws fails only its own run, so one broken routine never holds the
 * others back. Without `targetUnavailable`, every run starts.
 */
export async function checkTargets<Run extends ScheduledRun>(
  runs: readonly Run[],
  targetUnavailable: ((run: Run) => Promise<TargetUnavailableWhy | null>) | undefined,
): Promise<CheckedTargets<Run>> {
  const checked: CheckedTargets<Run> = { start: [], unavailable: [], failed: [] };
  for (const run of runs) {
    const time = { key: run.key, at: run.at.toISOString() };
    let why: TargetUnavailableWhy | null;
    try {
      why = targetUnavailable === undefined ? null : await targetUnavailable(run);
    } catch (error) {
      checked.failed.push({
        ...time,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      continue;
    }
    if (why === null) {
      checked.start.push(run);
    } else {
      checked.unavailable.push({ ...time, why });
    }
  }
  return checked;
}
