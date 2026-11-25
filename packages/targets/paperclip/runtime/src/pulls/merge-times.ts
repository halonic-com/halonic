import type { GitHubGet } from "../github.ts";
import type { ActionHandler } from "../handlers.ts";
import { readUnlessHidden, repositoriesOf } from "./reads.ts";

/**
 * The `github.merge-times` action: how long the pull requests merged over the
 * last `days` took from being opened to being merged, read from GitHub's
 * closed pull request list. `tooling/paperclip`'s `merge_speed` measures time
 * in the merge queue from the PR watcher's snapshots instead, which the
 * runtime doesn't have, so every answer names what it measures. Pull request
 * numbers and times only: no title or branch.
 */

/** The measure, as every answer names it. */
export const measure = "opened to merged";

/** Closed pull requests read per repository at most: 10 pages of 100. */
export const pageLimit = 10;

/** The tool's `days` when its settings leave it out, as the format's default. */
const defaultDays = 7;

/** One merged pull request in the window. */
export interface MergedPull {
  readonly number: number;
  readonly mergedAt: string;
  /** From `created_at` to `merged_at`. */
  readonly minutesOpenToMerged: number;
}

/** One repository's figures. */
export interface RepoMergeTimes {
  readonly repo: string;
  readonly merged: readonly MergedPull[];
  readonly medianMinutes: number | null;
  readonly longestMinutes: number | null;
  /** The page limit stopped the read before the window's start: older merges are missing. */
  readonly cutShort: boolean;
}

/** What the action returns as `data`. */
export interface MergeTimes {
  readonly measure: typeof measure;
  readonly days: number;
  readonly since: string;
  readonly repos: readonly RepoMergeTimes[];
  /** Repositories after the first that the token doesn't reach. */
  readonly unread: readonly string[];
}

/** The parts of GitHub's closed pull request list the action reads. */
interface ClosedPull {
  readonly number: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly merged_at: string | null;
  readonly base: {
    readonly ref: string;
    readonly repo?: { readonly default_branch?: string } | null;
  };
}

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/**
 * The closed pull requests updated since `since`, newest update first. A
 * merge is also an update, so once a page reaches an update before `since`,
 * no later page holds a merge in the window.
 */
async function closedSince(
  get: GitHubGet,
  repo: string,
  since: number,
): Promise<{ pulls: ClosedPull[]; cutShort: boolean }> {
  const pulls: ClosedPull[] = [];
  for (let page = 1; page <= pageLimit; page += 1) {
    const list = (await get(
      `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    )) as ClosedPull[];
    pulls.push(...list);
    const reachedStart = list.some((pull) => Date.parse(pull.updated_at) < since);
    if (list.length < 100 || reachedStart) {
      return { pulls, cutShort: false };
    }
  }
  return { pulls, cutShort: true };
}

/** One repository's pull requests merged into its default branch since `since`. */
export async function repoMergeTimes(
  get: GitHubGet,
  repo: string,
  since: number,
): Promise<RepoMergeTimes> {
  const { pulls, cutShort } = await closedSince(get, repo, since);
  const merged = pulls
    .filter((pull) => pull.merged_at !== null && Date.parse(pull.merged_at) >= since)
    // A stacked pull request merges into another branch first; only the default branch counts.
    .filter((pull) => pull.base.ref === pull.base.repo?.default_branch)
    .map((pull): MergedPull => {
      const mergedAt = pull.merged_at as string;
      const took = Date.parse(mergedAt) - Date.parse(pull.created_at);
      return {
        number: pull.number,
        mergedAt,
        minutesOpenToMerged: Math.max(0, Math.round(took / minuteMs)),
      };
    });
  const minutes = merged.map((pull) => pull.minutesOpenToMerged);
  return {
    repo,
    merged,
    medianMinutes: median(minutes),
    longestMinutes: minutes.length === 0 ? null : Math.max(...minutes),
    cutShort,
  };
}

/** The figures for every repository the tool lists, over the `days` before `now`. */
export async function mergeTimes(
  get: GitHubGet,
  repos: readonly string[],
  days: number,
  now: Date,
): Promise<MergeTimes> {
  const since = now.getTime() - days * dayMs;
  const found: RepoMergeTimes[] = [];
  const unread: string[] = [];
  for (const [index, repo] of repos.entries()) {
    const times = await readUnlessHidden(() => repoMergeTimes(get, repo, since), index === 0);
    if (times === undefined) {
      unread.push(repo);
    } else {
      found.push(times);
    }
  }
  return { measure, days, since: new Date(since).toISOString(), repos: found, unread };
}

/** Minutes as `45 min`, `3 h 5 min` or `2 d 4 h`. */
export function duration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ${minutes % 60} min`;
  }
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function repoLines(times: RepoMergeTimes, days: number): string[] {
  const count = times.merged.length;
  const perDay = Math.round((count / days) * 10) / 10;
  const lines = [`${times.repo}: ${count} merged into the default branch (${perDay} per day).`];
  if (times.medianMinutes !== null && times.longestMinutes !== null) {
    lines.push(
      `- Opened to merged: median ${duration(times.medianMinutes)}, longest ${duration(times.longestMinutes)}.`,
    );
  }
  if (times.cutShort) {
    lines.push(
      `- Only the ${pageLimit * 100} most recently updated closed pull requests were read; older merges in the window are missing.`,
    );
  }
  return lines;
}

/** The answer an agent reads: the measure first, then one block per repository. */
export function mergeTimesText(times: MergeTimes): string {
  return [
    `Merge times, last ${times.days} days, measured ${measure}: from when a pull request was opened to when it merged, not its time in the merge queue.`,
    ...times.repos.flatMap((repo) => repoLines(repo, times.days)),
    ...times.unread.map((repo) => `Not read: ${repo}, the token doesn't reach it.`),
  ].join("\n");
}

/** The `days` the tool's settings give, or the format's default. */
function daysOf(settings: object): number {
  return "days" in settings && typeof settings.days === "number" ? settings.days : defaultDays;
}

/** Reads the merge times of the tool's repositories over its `days`. */
export const mergeTimesHandler: ActionHandler = {
  capabilities: [],
  run: async ({ tool, now, github }) => {
    if (tool.action.run !== "github.merge-times") {
      return { error: `${tool.name}: runs ${tool.action.run}, not github.merge-times.` };
    }
    const days = daysOf(tool.action.with);
    const times = await mergeTimes(await github(), repositoriesOf(tool), days, now);
    return { content: mergeTimesText(times), data: times };
  },
};
