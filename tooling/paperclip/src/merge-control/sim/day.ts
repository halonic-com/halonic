/**
 * A recorded day as the simulator replays it: when each pull request was
 * ready, which ones broke their merge group or conflicted, and the times
 * measured that day. The recorder's passes and the Merger's files both turn
 * into this (`from-records.ts`, `import-merger.ts`).
 */

/** One pull request's part in the day. */
export interface SimPull {
  readonly number: number;
  /** When it first passed the gate outside the queue. */
  readonly readyAt: string;
  readonly fastTrack: boolean;
  /** Its merge group failed that day: the first build fails, and it waits for a new head. */
  readonly failsOnce: boolean;
  /** When it started to conflict with `main` while queued, if it did. */
  readonly conflictsAt: string | null;
  readonly files: readonly string[];
}

/** The times the simulator plays GitHub with. */
export interface SimTimings {
  /** One merge group's build. */
  readonly groupBuildMinutes: number;
  /** From a failed group or a conflict to a new head that passes the gate: PR CI plus the review delay. */
  readonly refixMinutes: number;
  /** Merge groups GitHub builds at once. */
  readonly buildLimit: number;
  /** Groups the merge-queue runners take at once without a wait; null when unknown, counted as always free. */
  readonly runnerGroups: number | null;
}

/** What happened on the day itself, where the data says. */
export interface RecordedOutcome {
  readonly merged: number;
  readonly jumps: number;
  readonly groupsCancelledByJumps: number;
  readonly timeToMerge: Spread;
}

/** The day the simulator replays. */
export interface SimDay {
  readonly date: string;
  readonly pulls: readonly SimPull[];
  readonly timings: SimTimings;
  readonly recorded: RecordedOutcome | null;
}

/** Median and 90th percentile, in minutes; null without samples. */
export interface Spread {
  readonly count: number;
  readonly median: number | null;
  readonly p90: number | null;
}

/** The `p`-th percentile (0–1) of `values`, nearest rank; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank] ?? null;
}

/** Median and 90th percentile of `values`, rounded to a tenth. */
export function spreadOf(values: readonly number[]): Spread {
  const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
  return {
    count: values.length,
    median: round(percentile(values, 0.5)),
    p90: round(percentile(values, 0.9)),
  };
}

/** Timings when the day doesn't say: about 15 minutes a group (HAL-14115), 8 at once. */
export const defaultTimings: SimTimings = {
  groupBuildMinutes: 15,
  refixMinutes: 90,
  buildLimit: 8,
  runnerGroups: null,
};

/** Minutes between two ISO times. */
export function minutesBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 60_000;
}

/**
 * Timings measured from a day's samples: a group's build is the lower
 * quartile of enqueue-to-merge (the entries that didn't wait behind
 * others), the refix the median from a failure to the next ready head.
 */
export function measuredTimings(samples: {
  readonly enqueueToMerge: readonly number[];
  readonly refix: readonly number[];
  readonly building: readonly number[];
}): SimTimings {
  const build = percentile(samples.enqueueToMerge, 0.25);
  const refix = percentile(samples.refix, 0.5);
  const most = samples.building.length === 0 ? null : Math.max(...samples.building);
  return {
    groupBuildMinutes: build === null ? defaultTimings.groupBuildMinutes : Math.max(5, build),
    refixMinutes: refix === null ? defaultTimings.refixMinutes : Math.max(10, refix),
    buildLimit: most === null || most < 1 ? defaultTimings.buildLimit : most,
    runnerGroups: null,
  };
}
