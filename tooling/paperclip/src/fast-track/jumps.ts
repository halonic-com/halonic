import { fastTrackLabel } from "../pr-tools/queue-state.ts";
import type { SnapshotRepo } from "../snapshot/shape.ts";

/**
 * The jump cost log, as the board's Fast-track monitor keeps it
 * (`jumps.py`): for each `fast-track` pull request in the merge queue, how
 * many were ahead of it, whether it jumped, and an estimate of the minutes
 * it saved. The groups a jump rebuilt are not counted yet: that needs the
 * Actions runs, which the snapshot doesn't read.
 */

/** One `fast-track` pull request's stay in the merge queue. */
export interface JumpRecord {
  readonly repo: string;
  readonly number: number;
  readonly enqueuedAt: string;
  /** Its position when a pass first saw it in the queue. */
  readonly firstPosition: number;
  /** Entries queued before it: those it waits for without a jump. */
  readonly ahead: number;
  readonly jumped: boolean;
  readonly mergesLastHour: number;
  /** Groups whose `ci-ok` was still running. */
  readonly groupsBuilding: number;
  /** How long it would have waited without a jump, by the monitor's estimate. */
  readonly estimatedWaitMinutes: number;
  readonly mergedAt: string | null;
  readonly enqueueToMergeMinutes: number | null;
}

/** The newest records kept in plugin state. */
export const keptJumps = 200;

/** Minutes one merge group takes, about, from forming to merging. */
const groupMinutes = 13;

/** The monitor's estimate of the wait without a jump: a group's time, then the queue's pace. */
export function waitWithoutJump(ahead: number, building: number, mergesLastHour: number): number {
  return Math.round(
    groupMinutes + (Math.max(0, ahead - building) * 60) / Math.max(1, mergesLastHour),
  );
}

function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}

function firstSeen(repo: SnapshotRepo, number: number, now: Date): JumpRecord | undefined {
  const entry = repo.queue.find((each) => each.number === number);
  if (entry === undefined) {
    return undefined;
  }
  const ahead = repo.queue.filter((each) => each.enqueuedAt < entry.enqueuedAt).length;
  const hourAgo = now.getTime() - 60 * 60_000;
  const mergesLastHour = repo.pulls.filter(
    (pull) => pull.mergedAt !== null && Date.parse(pull.mergedAt) > hourAgo,
  ).length;
  const building = new Set(
    repo.queue.flatMap((each) =>
      each.groupHead !== null && each.groupCiOk === "pending" ? [each.groupHead] : [],
    ),
  ).size;
  return {
    repo: repo.repo,
    number,
    enqueuedAt: entry.enqueuedAt,
    firstPosition: entry.position,
    ahead,
    jumped: ahead > 0 && entry.position <= Math.max(1, ahead / 2),
    mergesLastHour,
    groupsBuilding: building,
    estimatedWaitMinutes: waitWithoutJump(ahead, building, mergesLastHour),
    mergedAt: null,
    enqueueToMergeMinutes: null,
  };
}

/** Adds the `fast-track` entries a pass sees for the first time, and closes the ones that merged. */
export function updateJumps(
  repo: SnapshotRepo,
  now: Date,
  records: readonly JumpRecord[],
): JumpRecord[] {
  const pulls = new Map(repo.pulls.map((pull) => [pull.number, pull]));
  const updated = records.map((record) => {
    const pull = pulls.get(record.number);
    if (record.repo !== repo.repo || record.mergedAt !== null || pull?.mergedAt == null) {
      return record;
    }
    return {
      ...record,
      mergedAt: pull.mergedAt,
      enqueueToMergeMinutes: minutesBetween(record.enqueuedAt, pull.mergedAt),
    };
  });
  for (const entry of repo.queue) {
    const labelled = pulls
      .get(entry.number)
      ?.open?.labels.some((label) => label.name === fastTrackLabel);
    const known = updated.some(
      (record) =>
        record.repo === repo.repo &&
        record.number === entry.number &&
        record.enqueuedAt === entry.enqueuedAt,
    );
    const record = labelled === true && !known ? firstSeen(repo, entry.number, now) : undefined;
    if (record !== undefined) {
      updated.push(record);
    }
  }
  return updated.slice(-keptJumps);
}

/** One line of totals over the merged records: the monitor's daily line. */
export function jumpTotals(records: readonly JumpRecord[]): string {
  const merged = records.filter((record) => record.enqueueToMergeMinutes !== null);
  const jumped = merged.filter((record) => record.jumped);
  const saved = jumped.reduce(
    (sum, record) => sum + record.estimatedWaitMinutes - (record.enqueueToMergeMinutes ?? 0),
    0,
  );
  return `fast-track jumps: ${records.length} queue entries logged, ${merged.length} merged, ${jumped.length} of those jumped, about ${saved} min saved by the estimate.`;
}
