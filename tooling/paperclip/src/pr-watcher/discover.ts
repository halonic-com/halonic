import { everyPage, type GitHubGet } from "./github.ts";

/**
 * Finds the pull requests of each task by branch name. The plugin API can't
 * read a task's work products, so the watcher relies on the branch rule in
 * the root AGENTS.md instead: `mateo/HAL-15359-pr-watcher` is Mateo's work
 * on HAL-15359.
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

interface ListedPull {
  readonly number: number;
  readonly updated_at: string;
  readonly head: { readonly ref: string; readonly repo: { readonly full_name: string } | null };
}

/** The task a branch names: `mateo/HAL-15359-x` names `HAL-15359`. */
export function taskOfBranch(branch: string): string | undefined {
  const match = /^[\w.-]+\/([a-z]+-\d+)(?:-|$)/i.exec(branch);
  return match?.[1]?.toUpperCase();
}

/** Closed pull requests updated since `since`, newest first, page by page until older. */
async function recentlyClosed(get: GitHubGet, repo: string, since: number): Promise<ListedPull[]> {
  const found: ListedPull[] = [];
  for (let page = 1; ; page += 1) {
    const list = (await get(
      `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    )) as ListedPull[];
    const recent = list.filter((pull) => Date.parse(pull.updated_at) >= since);
    found.push(...recent);
    if (list.length < 100 || recent.length < list.length) {
      return found;
    }
  }
}

/**
 * Whether the pull request's branch lives in the watched repository. Anyone
 * can open a pull request from a fork with a branch named like ours, so only
 * our own branches count. A fork that was deleted has no `head.repo`.
 */
function fromRepo(pull: ListedPull, repo: string): boolean {
  return pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase();
}

/**
 * Every open pull request, and every one closed in the last
 * `closedWindowDays` days, on each repository, grouped by the task its
 * branch names. Branches that name no task, and branches in forks, are left out.
 */
export async function discoverPulls(
  get: GitHubGet,
  repos: readonly string[],
  now: Date,
): Promise<FoundPulls> {
  const since = now.getTime() - closedWindowDays * 24 * 60 * 60 * 1000;
  const found = new Map<string, PullRef[]>();
  for (const repo of repos) {
    const open = (await everyPage(get, `/repos/${repo}/pulls?state=open`)) as ListedPull[];
    const closed = await recentlyClosed(get, repo, since);
    for (const pull of [...open, ...closed].filter((listed) => fromRepo(listed, repo))) {
      const task = taskOfBranch(pull.head.ref);
      const known = found.get(task ?? "") ?? [];
      // A pull request that closed between the two reads is in both lists.
      if (
        task !== undefined &&
        !known.some((ref) => ref.repo === repo && ref.number === pull.number)
      ) {
        found.set(task, [...known, { repo, number: pull.number, branch: pull.head.ref }]);
      }
    }
  }
  return found;
}
