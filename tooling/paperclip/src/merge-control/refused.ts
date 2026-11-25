import type { GroupRun } from "./snapshot.ts";

/**
 * A merge group whose jobs our runner hook refused (the board, HAL-17925,
 * 25 Nov, as the Merger's `pass.js` and `stats.js` do it since 00:53): the
 * group had already left the queue, so the hook turned its jobs away and the
 * run ended red. That is a rebuilt group, not a failure. It holds nobody,
 * lifts no flake, doesn't start the main-red check, and counts as cancelled.
 * Only when every failed job carries the hook's annotation: one real failure
 * beside it, or a job whose annotations weren't read, keeps the culprit hold.
 */

/** The title of the failure annotation the runner hook puts on a job it refused. */
export const hookRefusedTitle = "halonic-ci refused this job";

/** The job whose verdict only sums up the others; its own failure says nothing. */
const summaryJob = "ci-ok";

/** Whether every failed job other than `ci-ok` was refused by the runner hook. */
export function refusedOnly(run: GroupRun): boolean {
  const jobs = run.failedJobs.filter((job) => job.name !== summaryJob);
  if (jobs.length === 0) {
    return false;
  }
  // Titles missing means they weren't read or the read failed: never a reason to skip a hold.
  return jobs.every((job) => job.annotationTitles?.includes(hookRefusedTitle) === true);
}

/** Completed merge groups, by how they count in the stats. */
export interface GroupCounts {
  readonly failed: number;
  /** Cancelled groups, the hook-refused ones included. */
  readonly cancelled: number;
  readonly hookRefused: number;
}

/** Counts failed and cancelled groups; a hook-refused group counts as cancelled, not failed. */
export function groupCounts(runs: readonly GroupRun[]): GroupCounts {
  let failed = 0;
  let cancelled = 0;
  let hookRefused = 0;
  for (const run of runs) {
    if (refusedOnly(run)) {
      cancelled += 1;
      hookRefused += 1;
    } else if (run.conclusion === "failure") {
      failed += 1;
    } else if (run.conclusion === "cancelled") {
      cancelled += 1;
    }
  }
  return { failed, cancelled, hookRefused };
}

/** The stats line's cancelled part, as `stats.js` writes it. */
export function cancelledText(counts: GroupCounts): string {
  return `cancelled ${counts.cancelled} (hook-refused ${counts.hookRefused})`;
}
