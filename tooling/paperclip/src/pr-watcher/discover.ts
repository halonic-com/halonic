import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";

/**
 * Finds the pull requests of each task by branch name. The plugin API can't
 * read a task's work products, so the watcher relies on the branch rule in
 * the root AGENTS.md instead: `mateo/HAL-15359-pr-watcher` is Mateo's work
 * on HAL-15359. It reads the pass's GitHub snapshot, so it sends no requests.
 */

/** A pull request found for a task, with the branch that names its author. */
export interface PullRef {
  readonly repo: string;
  readonly number: number;
  readonly branch: string;
}

/** Task identifier → its pull requests. */
export type FoundPulls = ReadonlyMap<string, readonly PullRef[]>;

/** How far back closed pull requests are read. Older merges are missed. */
export const closedWindowDays = 3;

/** The task a branch names: `mateo/HAL-15359-x` names `HAL-15359`. */
export function taskOfBranch(branch: string): string | undefined {
  const match = /^[\w.-]+\/([a-z]+-\d+)(?:-|$)/i.exec(branch);
  return match?.[1]?.toUpperCase();
}

/**
 * Whether the pull request's branch lives in the watched repository. Anyone
 * can open a pull request from a fork with a branch named like ours, so only
 * our own branches count. A fork that was deleted has no head repository.
 */
function fromRepo(pull: SnapshotPull, repo: string): boolean {
  return pull.headRepo?.toLowerCase() === repo.toLowerCase();
}

/**
 * Every open pull request in the snapshot, and every one closed in the last
 * `closedWindowDays` days before it was taken, grouped by the task its
 * branch names. Branches that name no task, and branches in forks, are left out.
 */
export function discoverPulls(snapshot: Snapshot): FoundPulls {
  const since = Date.parse(snapshot.takenAt) - closedWindowDays * 24 * 60 * 60 * 1000;
  const found = new Map<string, PullRef[]>();
  for (const { repo, pulls } of snapshot.repos) {
    const recent = pulls.filter(
      (pull) => pull.state === "open" || Date.parse(pull.updatedAt) >= since,
    );
    for (const pull of recent.filter((listed) => fromRepo(listed, repo))) {
      const task = taskOfBranch(pull.branch);
      const known = found.get(task ?? "") ?? [];
      // A pull request that closed between the two reads is in both lists.
      if (
        task !== undefined &&
        !known.some((ref) => ref.repo === repo && ref.number === pull.number)
      ) {
        found.set(task, [...known, { repo, number: pull.number, branch: pull.branch }]);
      }
    }
  }
  return found;
}
