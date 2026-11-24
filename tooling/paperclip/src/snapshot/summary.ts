import { type MergeSpeed, type MergeSpeedRecord, mergeSpeed } from "../board-check/merge-speed.ts";
import { branchOwner } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import type { DequeueReason } from "./dequeue.ts";
import { capped, type SeverityCounts } from "./severity.ts";
import type { QueueEntry, Snapshot, SnapshotPull, SnapshotRepo } from "./shape.ts";

/**
 * What the board-only `github/summary` and `github/pr/{number}` routes answer
 * (HAL-17604, architecture section 1.5): the stored snapshot, trimmed for
 * Halonic's `TeamStatus` provider. It carries numbers, states, times, names
 * of checks and reviewers, and capped titles and reasons. No GitHub login
 * leaves it: the board's becomes "the board", an agent is named by its
 * branch, anyone else is "outside contributor". No review or comment text.
 */

/** The longest check name and dequeue reason an answer carries. */
export const reasonCap = 120;

/** The most failing or pending check names one pull request lists. */
const checkListCap = 20;

/** The account every agent pushes as; its pull requests are named by their branch's agent. */
const agentAccount = "halonic-dev";

/** Who opened a pull request, without their login. */
export type Opener =
  | { readonly kind: "agent"; readonly name: string }
  | { readonly kind: "person"; readonly name: "the board" | "outside contributor" };

/** One pull request in the summary. */
export interface PullSummary {
  readonly number: number;
  readonly title: string | null;
  readonly author: Opener;
  /** The task its branch names, such as `HAL-17604`. */
  readonly work: string | null;
  readonly state: SnapshotPull["state"];
  readonly updatedAt: string;
  readonly mergedAt: string | null;
  readonly draft: boolean | null;
  readonly mergeable: "yes" | "no" | "unknown" | null;
  readonly ciOk: string | null;
  readonly inQueue: boolean;
  readonly fastTrack: boolean;
  /** Reviewers whose signed approval names the current head. */
  readonly approvedBy: readonly string[];
  /** The first failing check's name, capped. */
  readonly failedCheck: string | null;
  readonly reviewCounts: SeverityCounts | null;
  /** The queue session's newest dequeue reason for it, capped. */
  readonly dequeued: { readonly at: string; readonly reason: string } | null;
}

/** One merge queue entry, without who queued it. */
export type QueueSummary = Pick<
  QueueEntry,
  "number" | "position" | "state" | "enqueuedAt" | "groupHead" | "estimatedSeconds"
> & {
  readonly groupCiOk: string | null;
  readonly jobsWaiting: number;
  readonly waitingSince: string | null;
};

/** One repository in the summary. */
export interface RepoSummary {
  readonly repo: string;
  readonly defaultBranch: string;
  readonly open: readonly PullSummary[];
  /** Merged or closed within the snapshot's window. */
  readonly recent: readonly PullSummary[];
  readonly queue: readonly QueueSummary[];
}

/** The `github/summary` answer. `takenAt` is null before the first snapshot. */
export interface GitHubSummary {
  readonly takenAt: string | null;
  readonly repos: readonly RepoSummary[];
  /** The last 24 hours' merge speed, when the board check has tracked the queue. */
  readonly mergeSpeed: MergeSpeed | null;
}

/** The `github/pr/{number}` answer. */
export interface PullDetail {
  readonly takenAt: string;
  readonly repo: string;
  readonly pull: PullSummary;
  readonly failingChecks: readonly string[];
  readonly pendingChecks: readonly string[];
  readonly approvals: readonly { readonly by: string; readonly head: string }[];
  readonly labels: readonly string[];
  readonly queue: QueueSummary | null;
}

/** What the mapping reads besides the snapshot. */
export interface SummaryInputs {
  /** The board's GitHub login, from the plugin's settings; empty when unset. */
  readonly boardLogin: string;
  readonly dequeues: readonly DequeueReason[];
}

function openerOf(pull: SnapshotPull, repo: string, boardLogin: string): Opener {
  const login = pull.open?.author ?? null;
  if (boardLogin !== "" && login?.toLowerCase() === boardLogin.toLowerCase()) {
    return { kind: "person", name: "the board" };
  }
  // Only collaborators push branches into the repository itself, and a closed
  // pull request carries no author in the snapshot: an in-repo branch named
  // `<agent>/HAL-<n>-…` is an agent's unless another account opened it.
  const agent = taskOfBranch(pull.branch) === undefined ? undefined : branchOwner(pull.branch);
  const byAgentAccount = login === agentAccount || (login === null && pull.state !== "open");
  if (byAgentAccount && pull.headRepo === repo && agent !== undefined) {
    return { kind: "agent", name: agent };
  }
  return { kind: "person", name: "outside contributor" };
}

function dequeuedOf(pull: SnapshotPull, repo: string, dequeues: readonly DequeueReason[]) {
  const newest = dequeues
    .filter((entry) => entry.repo === repo && entry.number === pull.number)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return newest === undefined ? null : { at: newest.at, reason: capped(newest.reason, reasonCap) };
}

function pullSummary(pull: SnapshotPull, repo: string, inputs: SummaryInputs): PullSummary {
  const open = pull.open;
  const failing = open?.failingChecks?.[0];
  return {
    number: pull.number,
    title: pull.title ?? null,
    author: openerOf(pull, repo, inputs.boardLogin),
    work: taskOfBranch(pull.branch) ?? null,
    state: pull.state,
    updatedAt: pull.updatedAt,
    mergedAt: pull.mergedAt,
    draft: open?.draft ?? null,
    mergeable: open?.mergeable ?? null,
    ciOk: open?.ciOk ?? null,
    inQueue: open?.inQueue ?? false,
    fastTrack: open?.labels.some((label) => label.name === "fast-track") ?? false,
    approvedBy: (open?.approvals ?? [])
      .filter((approval) => approval.head === pull.head)
      .map((approval) => approval.by),
    failedCheck: failing === undefined ? null : capped(failing, reasonCap),
    reviewCounts: open?.reviewCounts ?? null,
    dequeued: dequeuedOf(pull, repo, inputs.dequeues),
  };
}

function queueSummary(entry: QueueEntry): QueueSummary {
  return {
    number: entry.number,
    position: entry.position,
    state: entry.state,
    enqueuedAt: entry.enqueuedAt,
    groupHead: entry.groupHead,
    estimatedSeconds: entry.estimatedSeconds,
    groupCiOk: entry.groupCiOk ?? null,
    jobsWaiting: entry.jobsWaiting ?? 0,
    waitingSince: entry.waitingSince ?? null,
  };
}

function repoSummary(repo: SnapshotRepo, inputs: SummaryInputs): RepoSummary {
  const pulls = repo.pulls.map((pull) => pullSummary(pull, repo.repo, inputs));
  return {
    repo: repo.repo,
    defaultBranch: repo.defaultBranch,
    open: pulls.filter((pull) => pull.state === "open"),
    recent: pulls.filter((pull) => pull.state !== "open"),
    queue: repo.queue.map(queueSummary),
  };
}

/** The summary of a snapshot, or of none yet. */
export function githubSummary(
  snapshot: Snapshot | undefined,
  record: MergeSpeedRecord | undefined,
  inputs: SummaryInputs,
): GitHubSummary {
  if (snapshot === undefined) {
    return { takenAt: null, repos: [], mergeSpeed: null };
  }
  return {
    takenAt: snapshot.takenAt,
    repos: snapshot.repos.map((repo) => repoSummary(repo, inputs)),
    mergeSpeed:
      record === undefined ? null : mergeSpeed(record, snapshot, 24, new Date(snapshot.takenAt)),
  };
}

/** One pull request's detail, or undefined when the snapshot doesn't have it. */
export function githubPull(
  snapshot: Snapshot,
  repoName: string,
  number: number,
  inputs: SummaryInputs,
): PullDetail | undefined {
  const repo = snapshot.repos.find((candidate) => candidate.repo === repoName);
  const pull = repo?.pulls.find((candidate) => candidate.number === number);
  if (repo === undefined || pull === undefined) {
    return undefined;
  }
  const entry = repo.queue.find((candidate) => candidate.number === number);
  const names = (list: readonly string[] | undefined) =>
    (list ?? []).slice(0, checkListCap).map((name) => capped(name, reasonCap));
  return {
    takenAt: snapshot.takenAt,
    repo: repo.repo,
    pull: pullSummary(pull, repo.repo, inputs),
    failingChecks: names(pull.open?.failingChecks),
    pendingChecks: names(pull.open?.pendingChecks),
    approvals: (pull.open?.approvals ?? []).map(({ by, head }) => ({ by, head })),
    labels: (pull.open?.labels ?? []).map((label) => label.name),
    queue: entry === undefined ? null : queueSummary(entry),
  };
}
