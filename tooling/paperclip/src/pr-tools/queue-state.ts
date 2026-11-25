import { amsterdamTime } from "../amsterdam-time.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import type { Snapshot, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";

/**
 * The `queue_state` tool (Board Checker addendum on HAL-15997): the merge
 * queue, each group's `ci-ok`, the runner wait and the `fast-track` labels
 * with who added them, all from the PR watcher's last snapshot. It sends no
 * GitHub request of its own.
 */

/**
 * The label that puts a pull request first for review and in the merge queue (HAL-15971), and
 * sends its Linux checks to the fast pool (HAL-17616).
 */
export const fastTrackLabel = "fast-track";

/** A snapshot older than this missed at least two 10-minute passes. */
export const staleAfterMinutes = 30;

/** One merge-queue entry. */
export interface QueueRow {
  readonly number: number;
  readonly url: string | null;
  readonly task: string | undefined;
  readonly position: number;
  /** GitHub's entry state, such as `AWAITING_CHECKS`. */
  readonly state: string;
  readonly enqueuedBy: string | null;
  readonly minutesInQueue: number;
  /** `ci-ok` on the group's commit; `unknown` in a snapshot saved before the field. */
  readonly groupCiOk: CheckState | "not formed" | "unknown";
  readonly estimatedMinutes: number | null;
}

/** An open pull request with the `fast-track` label. */
export interface FastTrackRow {
  readonly number: number;
  readonly url: string;
  readonly task: string | undefined;
  /** Who added the label last; null when GitHub doesn't say. Null is unknown, never allowed. */
  readonly addedBy: string | null;
  readonly addedAt: string | null;
  readonly draft: boolean;
  readonly ciOk: CheckState;
  readonly inQueue: boolean;
}

/** One repository's queue. */
export interface RepoQueueState {
  readonly repo: string;
  readonly entries: readonly QueueRow[];
  /** Merge-group jobs queued for a runner, or null when the snapshot is older than these fields. */
  readonly runnerWait: { readonly jobs: number; readonly longestMinutes: number | null } | null;
  readonly fastTrack: readonly FastTrackRow[];
}

/** What `queue_state` returns. */
export interface QueueState {
  readonly takenAt: string;
  readonly ageMinutes: number;
  readonly stale: boolean;
  readonly repos: readonly RepoQueueState[];
}

function minutesBetween(from: string, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - Date.parse(from)) / 60_000));
}

/** The task a branch names, only for a branch in the repository itself: a fork's name proves nothing. */
export function taskOf(repo: string, pull: SnapshotPull | undefined): string | undefined {
  return pull?.headRepo?.toLowerCase() === repo.toLowerCase()
    ? taskOfBranch(pull.branch)
    : undefined;
}

/** Jobs waiting across the queue's groups, each group commit counted once. */
function runnerWaitOf(repo: SnapshotRepo, now: Date): RepoQueueState["runnerWait"] {
  if (repo.queue.some((entry) => entry.jobsWaiting === undefined)) {
    return null;
  }
  const groups = new Map(repo.queue.map((entry) => [entry.groupHead ?? `#${entry.number}`, entry]));
  let jobs = 0;
  let oldest: string | undefined;
  for (const entry of groups.values()) {
    jobs += entry.jobsWaiting ?? 0;
    const since = entry.waitingSince ?? undefined;
    if (since !== undefined && (oldest === undefined || since < oldest)) {
      oldest = since;
    }
  }
  return { jobs, longestMinutes: oldest === undefined ? null : minutesBetween(oldest, now) };
}

function repoState(repo: SnapshotRepo, now: Date): RepoQueueState {
  const pulls = new Map(repo.pulls.map((pull) => [pull.number, pull]));
  const entries = [...repo.queue]
    .sort((a, b) => a.position - b.position)
    .map((entry): QueueRow => {
      const pull = pulls.get(entry.number);
      return {
        number: entry.number,
        url: pull?.url ?? null,
        task: taskOf(repo.repo, pull),
        position: entry.position,
        state: entry.state,
        enqueuedBy: entry.enqueuedBy,
        minutesInQueue: minutesBetween(entry.enqueuedAt, now),
        groupCiOk: entry.groupHead === null ? "not formed" : (entry.groupCiOk ?? "unknown"),
        estimatedMinutes:
          entry.estimatedSeconds === null ? null : Math.round(entry.estimatedSeconds / 60),
      };
    });
  const fastTrack = repo.pulls.flatMap((pull): FastTrackRow[] => {
    const label = pull.open?.labels.find((each) => each.name === fastTrackLabel);
    if (pull.open == null || label === undefined) {
      return [];
    }
    return [
      {
        number: pull.number,
        url: pull.url,
        task: taskOf(repo.repo, pull),
        addedBy: label.addedBy,
        addedAt: label.addedAt,
        draft: pull.open.draft,
        ciOk: pull.open.ciOk,
        inQueue: pull.open.inQueue,
      },
    ];
  });
  return { repo: repo.repo, entries, runnerWait: runnerWaitOf(repo, now), fastTrack };
}

/** The queue state of every repository in a snapshot, as of `now`. */
export function queueState(snapshot: Snapshot, now: Date): QueueState {
  const ageMinutes = minutesBetween(snapshot.takenAt, now);
  return {
    takenAt: snapshot.takenAt,
    ageMinutes,
    stale: ageMinutes > staleAfterMinutes,
    repos: snapshot.repos.map((repo) => repoState(repo, now)),
  };
}

function entryLine(row: QueueRow): string {
  const estimate =
    row.estimatedMinutes === null ? "" : `, GitHub estimates ${row.estimatedMinutes} min`;
  return `${row.position}. #${row.number} (${row.task ?? "no task"}): ${row.state}, group ci-ok ${row.groupCiOk}; queued ${row.minutesInQueue} min ago by ${row.enqueuedBy ?? "unknown"}${estimate}`;
}

function fastTrackLine(row: FastTrackRow): string {
  const by =
    row.addedBy === null
      ? "unknown (GitHub doesn't say; never counts as allowed)"
      : `${row.addedBy} at ${amsterdamTime(row.addedAt ?? "unknown time")}`;
  return `fast-track #${row.number} (${row.task ?? "no task"}): added by ${by}; ${row.draft ? "draft" : "ready"}, ci-ok ${row.ciOk}, ${row.inQueue ? "queued" : "not queued"}`;
}

function waitText(wait: RepoQueueState["runnerWait"]): string {
  if (wait === null) {
    return "runner wait not in this snapshot yet";
  }
  if (wait.jobs === 0) {
    return "no merge-group job waits for a runner";
  }
  return `${wait.jobs} merge-group jobs wait for a runner, the longest ${wait.longestMinutes ?? "?"} min`;
}

/** The queue state in lines an agent reads. */
export function queueStateText(state: QueueState): string {
  const age = `from the PR watcher's snapshot at ${amsterdamTime(state.takenAt)} (${state.ageMinutes} min ago)`;
  const lines = [
    state.stale
      ? `Merge queue ${age}. STALE: the watcher missed its last passes; check GitHub before acting on it.`
      : `Merge queue ${age}.`,
  ];
  for (const repo of state.repos) {
    lines.push(`${repo.repo}: ${repo.entries.length} in the queue; ${waitText(repo.runnerWait)}.`);
    lines.push(...repo.entries.map(entryLine));
    lines.push(
      ...(repo.fastTrack.length === 0
        ? ["no open pull request carries fast-track"]
        : repo.fastTrack.map(fastTrackLine)),
    );
  }
  return lines.join("\n");
}
