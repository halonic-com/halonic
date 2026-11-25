import type { PrStatus } from "../pr-tools/pr-status.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import type { OpenFacts, QueueEntry, SnapshotPull } from "../snapshot/shape.ts";

/**
 * One pull request's line in a state packet (HAL-17402): what `pr_status`
 * says about it, cut to what a wait check decides on, with the time its data
 * was read from GitHub. Plain JSON, so it can be kept in plugin state.
 */
export interface PullLine {
  readonly repo: string;
  readonly number: number;
  readonly state: "open" | "merged" | "closed";
  readonly draft: boolean;
  /** The head commit, or the merge commit once merged (the done rule reads `ci-ok` there). */
  readonly commit: string;
  readonly ciOk: CheckState;
  /** Open only; `n/a` once closed. */
  readonly mergeable: "yes" | "conflict" | "unknown" | "n/a";
  /** The reviewers with a signed approval on the head. */
  readonly approvedBy: readonly string[];
  /** Its place in the merge queue (1 first), true when queued with no place known yet, false when not queued. */
  readonly queue: number | boolean;
  /** When this line's data was read from GitHub, ISO. */
  readonly dataAsOf: string;
}

/** Its place in the merge queue while it is queued; the snapshot's queue may be older than `inQueue`. */
function queueOf(number: number, inQueue: boolean, queue: readonly QueueEntry[]): number | boolean {
  if (!inQueue) {
    return false;
  }
  return queue.find((entry) => entry.number === number)?.position ?? true;
}

/** The `ci-ok` that applies: the light run's while it's a draft. */
function ciOkOf(open: OpenFacts): CheckState {
  return open.draft ? open.draftCiOk : open.ciOk;
}

/** The snapshot's `no` in `pr_status`'s words. */
function mergeableOf(open: OpenFacts): PullLine["mergeable"] {
  return open.mergeable === "no" ? "conflict" : open.mergeable;
}

/**
 * An open or closed pull request's line from the watcher's snapshot, read
 * at `takenAt`. A merged one has no line here: its `ci-ok` on the merge
 * commit isn't in the snapshot, so it is always read (`mergedLine`).
 */
export function snapshotLine(
  repo: string,
  pull: SnapshotPull,
  queue: readonly QueueEntry[],
  takenAt: string,
): PullLine | undefined {
  if (pull.state === "merged") {
    return undefined;
  }
  const open = pull.open;
  return {
    repo,
    number: pull.number,
    state: pull.state,
    draft: open?.draft ?? false,
    commit: pull.head,
    ciOk: open === null ? "missing" : ciOkOf(open),
    mergeable: open === null ? "n/a" : mergeableOf(open),
    // A signed approval names the head by 7 or more characters. Whether it counts by the
    // path rules isn't in the snapshot; a fresh read (`statusLine`) says.
    approvedBy: (open?.approvals ?? [])
      .filter((approval) => pull.head.startsWith(approval.head))
      .map((approval) => approval.by),
    queue: open === null ? false : queueOf(pull.number, open.inQueue, queue),
    dataAsOf: takenAt,
  };
}

/** An open pull request's line from a fresh `pr_status` read. */
export function statusLine(
  status: PrStatus,
  queue: readonly QueueEntry[],
  readAt: string,
): PullLine {
  const open = status.state === "open";
  return {
    repo: status.repo,
    number: status.number,
    state: status.state,
    draft: status.draft,
    commit: status.head,
    ciOk: open ? status.ciOk : "missing",
    mergeable: open ? status.mergeable : "n/a",
    approvedBy: status.approvals
      .filter((approval) => approval.counts)
      .map((approval) => approval.by),
    queue: open ? queueOf(status.number, status.inQueue, queue) : false,
    dataAsOf: readAt,
  };
}

/** A merged pull request's line: `ci-ok` on its merge commit, as the done rule reads it. */
export function mergedLine(
  repo: string,
  number: number,
  mergeCommit: string,
  ciOk: CheckState,
  readAt: string,
): PullLine {
  return {
    repo,
    number,
    state: "merged",
    draft: false,
    commit: mergeCommit,
    ciOk,
    mergeable: "n/a",
    approvedBy: [],
    queue: false,
    dataAsOf: readAt,
  };
}

/** A merged pull request whose merge commit's `ci-ok` finished: it can't change any more. */
export function isFinal(line: PullLine): boolean {
  return line.state === "merged" && (line.ciOk === "success" || line.ciOk === "failure");
}

function queueText(queue: PullLine["queue"]): string {
  if (queue === false) return "not queued";
  return queue === true ? "in the merge queue" : `merge queue position ${queue}`;
}

/** `halonic-com/halonic#6126 open draft, head 21cb209, ci-ok success, …, dataAsOf <time>`. */
export function pullLineText(line: PullLine): string {
  const name = `${line.repo}#${line.number}`;
  const commit = line.commit.slice(0, 7);
  if (line.state === "merged") {
    return `${name} merged, merge commit ${commit}, ci-ok ${line.ciOk} on the merge commit; dataAsOf ${line.dataAsOf}`;
  }
  if (line.state === "closed") {
    return `${name} closed without merging, head ${commit}; dataAsOf ${line.dataAsOf}`;
  }
  const approved =
    line.approvedBy.length === 0
      ? "no approval on head"
      : `approved on head by ${line.approvedBy.join(", ")}`;
  const parts = [
    `${name} open${line.draft ? " draft" : ""}`,
    `head ${commit}`,
    `ci-ok ${line.ciOk}${line.draft ? " (draft light run)" : ""}`,
    `mergeable ${line.mergeable}`,
    approved,
    queueText(line.queue),
  ];
  return `${parts.join(", ")}; dataAsOf ${line.dataAsOf}`;
}
