import type { SnapshotRepo } from "../../snapshot/shape.ts";

/**
 * The jump cost log of the `fast-track` signal rule (HAL-18320, HAL-18973): for each
 * `fast-track` pull request in a merge queue, how many were ahead of it,
 * whether it jumped and the monitor's estimate of the minutes it saved, with
 * one line of totals a day. The same outcome as `fast-track/jumps.ts` and
 * the totals of `fast-track/pass.ts`, held to it by a parity test. Pure like
 * every rule here: type imports only, no I/O, time only from `input.now`.
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

/** One pass's input: every repository the snapshot read, and the log so far. */
export interface FastTrackJumpsInput {
  readonly now: string;
  readonly repos: readonly SnapshotRepo[];
  readonly records: readonly JumpRecord[];
  /** The UTC day the totals were last said, `YYYY-MM-DD`. */
  readonly totalsDay: string | null;
}

/** Keep this log for the next pass. */
export interface JumpLogAction {
  readonly kind: "jump-log";
  readonly records: readonly JumpRecord[];
}

/** The day's line of totals, once a UTC day while the log has records. */
export interface JumpTotalsAction {
  readonly kind: "jump-totals";
  readonly day: string;
  readonly line: string;
}

/** One thing a pass does. */
export type FastTrackJumpsAction = JumpLogAction | JumpTotalsAction;

/** The newest records kept. */
const keptJumps = 200;

/** Minutes one merge group takes, about, from forming to merging. */
const groupMinutes = 13;

const minutesBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60_000);

function firstSeen(repo: SnapshotRepo, number: number, now: string): JumpRecord | undefined {
  const entry = repo.queue.find((each) => each.number === number);
  if (entry === undefined) {
    return undefined;
  }
  const ahead = repo.queue.filter((each) => each.enqueuedAt < entry.enqueuedAt).length;
  const hourAgo = Date.parse(now) - 60 * 60_000;
  const mergesLastHour = repo.pulls.filter(
    (pull) => pull.mergedAt !== null && Date.parse(pull.mergedAt) > hourAgo,
  ).length;
  const building = new Set(
    repo.queue.flatMap((each) =>
      each.groupHead !== null && each.groupCiOk === "pending" ? [each.groupHead] : [],
    ),
  ).size;
  // A group's time, then the queue's pace.
  const wait = groupMinutes + (Math.max(0, ahead - building) * 60) / Math.max(1, mergesLastHour);
  return {
    repo: repo.repo,
    number,
    enqueuedAt: entry.enqueuedAt,
    firstPosition: entry.position,
    ahead,
    jumped: ahead > 0 && entry.position <= Math.max(1, ahead / 2),
    mergesLastHour,
    groupsBuilding: building,
    estimatedWaitMinutes: Math.round(wait),
    mergedAt: null,
    enqueueToMergeMinutes: null,
  };
}

/** Closes the records whose pull request merged, and adds the entries seen for the first time. */
function updateJumps(repo: SnapshotRepo, now: string, records: readonly JumpRecord[]) {
  const pulls = new Map(repo.pulls.map((pull) => [pull.number, pull]));
  const updated = records.map((record) => {
    const pull = pulls.get(record.number);
    if (record.repo !== repo.repo || record.mergedAt !== null || pull?.mergedAt == null) {
      return record;
    }
    const enqueueToMergeMinutes = minutesBetween(record.enqueuedAt, pull.mergedAt);
    return { ...record, mergedAt: pull.mergedAt, enqueueToMergeMinutes };
  });
  for (const entry of repo.queue) {
    const labels = pulls.get(entry.number)?.open?.labels ?? [];
    const known = updated.some(
      (record) =>
        record.repo === repo.repo &&
        record.number === entry.number &&
        record.enqueuedAt === entry.enqueuedAt,
    );
    const labelled = labels.some((label) => label.name === "fast-track");
    const record = labelled && !known ? firstSeen(repo, entry.number, now) : undefined;
    if (record !== undefined) {
      updated.push(record);
    }
  }
  return updated.slice(-keptJumps);
}

function totalsLine(records: readonly JumpRecord[]): string {
  const merged = records.filter((record) => record.enqueueToMergeMinutes !== null);
  const jumped = merged.filter((record) => record.jumped);
  const saved = jumped.reduce(
    (sum, record) => sum + record.estimatedWaitMinutes - (record.enqueueToMergeMinutes ?? 0),
    0,
  );
  return `fast-track jumps: ${records.length} queue entries logged, ${merged.length} merged, ${jumped.length} of those jumped, about ${saved} min saved by the estimate.`;
}

/**
 * The log to keep, then the day's totals when they are due.
 *
 * @example
 * decide({ now, repos: [], records: [], totalsDay: null }); // [{ kind: "jump-log", records: [] }]
 */
export function decide(input: FastTrackJumpsInput): FastTrackJumpsAction[] {
  let records = [...input.records];
  for (const repo of input.repos) {
    records = updateJumps(repo, input.now, records);
  }
  const day = input.now.slice(0, 10);
  const log: JumpLogAction = { kind: "jump-log", records };
  if (day === input.totalsDay || records.length === 0) {
    return [log];
  }
  return [log, { kind: "jump-totals", day, line: totalsLine(records) }];
}
