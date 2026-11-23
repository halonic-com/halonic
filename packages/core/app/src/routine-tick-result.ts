// What one tick of the routine scheduler did ({@link RoutineTickResult}),
// apart from the scheduler, so the parts that build the result read it
// without the scheduler.

import type { RunSummary } from "@halonicjs/events";
import type { UnavailableTime } from "./routine-targets.ts";

/** A due run and what went wrong with it: its start, or storing its due time as the last run. */
export interface RoutineFailure {
  key: string;
  /** ISO time the run was due. */
  at: string;
  error: Error;
}

/** A due time of a routine that a tick didn't start. */
export interface RoutineTime {
  key: string;
  /** ISO time the run was due. */
  at: string;
}

/** What one tick did. */
export interface RoutineTickResult {
  started: RunSummary[];
  /** Due runs that did not start. */
  failed: RoutineFailure[];
  /**
   * Runs that started (they are in `started` too) whose due time was not
   * stored as the routine's last run, so its next run may get an older
   * `{{trigger.lastRun}}`.
   */
  lastRunNotSaved: RoutineFailure[];
  /** Every due time waiting in the queue after the tick (`overlap: queue`), oldest first per routine. */
  queued: RoutineTime[];
  /** Due times dropped because a run of the routine was going (`overlap: skip`) or its queue was full. */
  skipped: RoutineTime[];
  /** Due times whose target can't be started (`targetUnavailable`), recorded as `target-unavailable` skips. */
  unavailable: UnavailableTime[];
  /** Routines whose skip records this tick added to, so a host can tell a page that shows them. */
  skipsSaved: string[];
  /** Routines whose skipped times this tick could not add to their skip records. */
  skipsNotSaved: { key: string; error: Error }[];
}

/** A new empty result each time, so no caller can change another's. */
export const nothing = (): RoutineTickResult => ({
  started: [],
  failed: [],
  lastRunNotSaved: [],
  queued: [],
  skipped: [],
  unavailable: [],
  skipsSaved: [],
  skipsNotSaved: [],
});

/** A due run as a {@link RoutineTime}. */
export function timeOf(run: { key: string; at: Date }): RoutineTime {
  return { key: run.key, at: run.at.toISOString() };
}

/** What was thrown, as an `Error`. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
