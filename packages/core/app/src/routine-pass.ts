// The pass of the routine scheduler (`RoutineScheduler.pass`): a tick that
// starts nothing while the user paused the routines, apart from the
// scheduler so its file stays small.

import type { LastRuns } from "./routine-last-runs.ts";
import type { RoutineSchedulerOptions, ScheduledRun } from "./routine-scheduler.ts";
import type { SkipRecords } from "./routine-skips.ts";
import type { RoutineTickResult } from "./routine-tick-result.ts";
import { type DroppedRange, TickSkips } from "./routine-tick-skips.ts";

/** What a pass did. */
export interface RoutinePassResult extends Pick<RoutineTickResult, "skipsSaved" | "skipsNotSaved"> {
  /** Whether it stored the clock's time as the last tick. */
  stored: boolean;
}

/** What {@link passOnce} works with: the scheduler's options and parts. */
export interface RoutinePassParts<Routine, Policy, Run extends ScheduledRun> {
  options: Pick<
    RoutineSchedulerOptions<Routine, Policy, Run>,
    "clock" | "coordination" | "routines" | "due" | "policy"
  >;
  lastTickKey: string;
  lastRuns: LastRuns;
  skipRecords: SkipRecords;
}

/** A new result of a pass that stored nothing. */
export const notPassed = (): RoutinePassResult => ({
  stored: false,
  skipsSaved: [],
  skipsNotSaved: [],
});

/**
 * Stores the clock's time as the last tick without starting any run
 * (`app.routine-pass`), so the scheduler's first tick after the pause skips
 * the times that fell due during it instead of catching them up. Times
 * queued before the pause stay queued. A stored tick at or after now stays,
 * and so does one another tick stored meanwhile.
 *
 * The times due in between are recorded as one `paused` skip per routine
 * (`app.routine-pass-skips`), after the last tick is stored: when another
 * tick stored first, that tick covered those times itself, and a crash in
 * between loses only the record. If reading the routines throws, the last
 * tick is still stored, so the pause holds, and then the pass rejects.
 */
export async function passOnce<Routine, Policy, Run extends ScheduledRun>(
  parts: RoutinePassParts<Routine, Policy, Run>,
): Promise<RoutinePassResult> {
  const { clock, coordination } = parts.options;
  const now = clock.now();
  const stored = await coordination.read(parts.lastTickKey);
  const result = notPassed();
  if (stored !== null && Date.parse(stored) >= now.getTime()) {
    return result;
  }
  const skips = new TickSkips();
  let unread: unknown = null;
  try {
    if (stored !== null) skips.addRanges(await pausedRanges(parts, new Date(stored), now));
  } catch (error) {
    unread = error;
  }
  result.stored = await coordination.compareAndSet(parts.lastTickKey, stored, now.toISOString());
  if (unread !== null) throw unread;
  if (result.stored) {
    await skips.record(parts.skipRecords, parts.lastRuns, now, result);
  }
  return result;
}

/**
 * Every time in `(lastTick, now]`, one range per routine: the tick function
 * puts each time either in a run or in a dropped range, whatever the
 * catch-up setting, so both together are all of them without a new walk.
 */
async function pausedRanges<Routine, Policy, Run extends ScheduledRun>(
  { options }: RoutinePassParts<Routine, Policy, Run>,
  lastTick: Date,
  now: Date,
): Promise<DroppedRange[]> {
  const { runs, skipped } = options.due(await options.routines(), lastTick, now, options.policy);
  const byKey = new Map<string, DroppedRange>();
  const add = (key: string, from: Date, to: Date, count: number, isMinimum: boolean): void => {
    const range = byKey.get(key);
    const countIsMinimum = isMinimum || range?.countIsMinimum === true;
    byKey.set(key, {
      key,
      reason: "paused",
      from: range === undefined || from < range.from ? from : range.from,
      to: range === undefined || to > range.to ? to : range.to,
      count: (range?.count ?? 0) + count,
      ...(countIsMinimum ? { countIsMinimum: true } : {}),
    });
  };
  for (const range of skipped) {
    add(range.key, range.from, range.to, range.count, range.countIsMinimum === true);
  }
  for (const run of runs) {
    add(run.key, run.at, run.at, 1, false);
  }
  return [...byKey.values()];
}
