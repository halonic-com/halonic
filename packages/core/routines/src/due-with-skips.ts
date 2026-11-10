import type { Routine } from "@halonicjs/format";
import {
  allowedTimes,
  type Clock,
  clockOf,
  DEFAULT_TICK_POLICY,
  type DueRun,
  type PlacedRoutine,
  routineKey,
  type TickPolicy,
  WINDOW_LIMIT,
} from "./due.ts";

/**
 * Why the catch-up rule dropped a due time: `missed` with catch-up off,
 * `latest` because "run once" kept only the newest time, `cap` past the most
 * times "run every missed time" keeps, `window` older than the catch-up window.
 */
export type SkipReason = "missed" | "latest" | "cap" | "window";

/** Due times of one routine that a tick dropped for one reason, oldest to newest. */
export interface SkippedRange {
  /** The routine key, as in {@link DueRun}. */
  key: string;
  reason: SkipReason;
  /** The oldest dropped time. */
  from: Date;
  /** The newest dropped time. */
  to: Date;
  /** How many times were dropped, `from` and `to` included. */
  count: number;
  /** Set when a cron's count stopped at its limit, so there were at least `count`. */
  countIsMinimum?: true;
}

/** What one tick says: the runs to start, and the due times it dropped. */
export interface DueTick {
  /** As `due` gives them, with `catchUp` on the oldest late run of each routine. */
  runs: DueRun[];
  /** By routine key, then oldest first. */
  skipped: SkippedRange[];
}

/**
 * `due`, plus every due time it drops, in ranges with the reason. With
 * catch-up off, every dropped time is `missed`, also past the window. With
 * "run once" or "run every missed time", times past the window are `window`,
 * then the ones past the cap `cap`, and the rest `latest`; each time gets one
 * reason. The oldest run of a routine that is more than the grace late gets
 * `catchUp` with how many times its rule dropped; its later runs get 0.
 */
export function dueWithSkips(
  routines: readonly PlacedRoutine[],
  lastTick: Date | null,
  now: Date,
  policy: TickPolicy = DEFAULT_TICK_POLICY,
): DueTick {
  if (!lastTick || now <= lastTick) return { runs: [], skipped: [] };
  const runs: DueRun[] = [];
  const skipped: SkippedRange[] = [];
  for (const placed of routines) {
    const clock = placed.routine.enabled ? clockOf(placed.routine, policy) : null;
    if (!clock) continue;
    const key = routineKey(placed);
    const kept = allowedTimes(clock, placed.routine.catchUp, lastTick, now, policy);
    const dropped = droppedRanges(clock, placed.routine.catchUp, lastTick, now, policy, kept);
    skipped.push(...dropped.map((range) => ({ key, ...range })));
    const trigger = clock.kind;
    runs.push(
      ...withCatchUp(kept, dropped, now, policy).map((run) => ({ ...run, key, placed, trigger })),
    );
  }
  runs.sort((a, b) => a.at.getTime() - b.at.getTime() || compare(a.key, b.key));
  return { runs, skipped };
}

type Range = Omit<SkippedRange, "key">;

/** The windows `allowedTimes` didn't search or didn't keep, each with its reason. */
function droppedRanges(
  clock: Clock,
  catchUp: Routine["catchUp"],
  lastTick: Date,
  now: Date,
  policy: TickPolicy,
  kept: readonly Date[],
): Range[] {
  const justBefore = (time: Date): Date => new Date(time.getTime() - 1);
  if (catchUp !== "last" && catchUp !== "all") {
    // As `allowedTimes`: a time exactly the grace late still counts.
    const graceStart = new Date(now.getTime() - policy.graceMs - 1);
    return rangesOf(clock, [[lastTick, graceStart, "missed"]]);
  }
  const oldest = new Date(now.getTime() - policy.maxCatchUpAgeMs - 1);
  const windowEnd = oldest > lastTick ? oldest : lastTick;
  const firstKept = kept[0];
  const ruleEnd = firstKept === undefined ? windowEnd : justBefore(firstKept);
  return rangesOf(clock, [
    [lastTick, windowEnd, "window"],
    [windowEnd, ruleEnd, catchUp === "all" ? "cap" : "latest"],
  ]);
}

/** A range for each window `(after, upTo]` with at least one time. */
function rangesOf(clock: Clock, windows: Array<[Date, Date, SkipReason]>): Range[] {
  const ranges: Range[] = [];
  for (const [after, upTo, reason] of windows) {
    if (upTo <= after) continue;
    const from = clock.times(after, upTo, 1)[0];
    const to = clock.newest(after, upTo);
    if (!from || !to) continue;
    const { count, isMinimum } = clock.count(after, upTo);
    ranges.push({ reason, from, to, count, ...(isMinimum ? { countIsMinimum: true } : {}) });
  }
  return ranges;
}

/** The kept times as runs, the late ones with `catchUp`: the count on the oldest, 0 after it. */
function withCatchUp(
  kept: readonly Date[],
  dropped: readonly Range[],
  now: Date,
  policy: TickPolicy,
): Array<Pick<DueRun, "at" | "catchUp">> {
  const countIsMinimum = dropped.some((range) => range.countIsMinimum);
  const total = dropped.reduce((sum, range) => sum + range.count, 0);
  // "At least" reads the same whichever count stopped, so it says what one walk can count.
  const skipped = countIsMinimum ? WINDOW_LIMIT : total;
  let counted = false;
  return kept.map((at) => {
    if (now.getTime() - at.getTime() <= policy.graceMs) return { at };
    const catchUp = counted
      ? { skipped: 0 }
      : { skipped, ...(countIsMinimum ? { countIsMinimum: true as const } : {}) };
    counted = true;
    return { at, catchUp };
  });
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
