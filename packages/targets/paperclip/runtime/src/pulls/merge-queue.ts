import { amsterdamTime } from "../amsterdam-time.ts";
import { type CheckState, checkState, type GitHubGet, type GitHubQuery } from "../github.ts";
import type { ActionHandler } from "../handlers.ts";
import { mergeQueueQuery, type QueueRepository, type Rollup } from "./merge-queue-query.ts";
import { ciOkName, readUnlessHidden, repositoriesOf, taskOfBranch } from "./reads.ts";

/**
 * The `github.merge-queue` action: each listed repository's merge queue,
 * each group's `ci-ok`, the merge-group jobs waiting for a runner, and the
 * open pull requests labelled `fast-track` with who added the label. Ported
 * from `tooling/paperclip`'s `queue_state`, with the same answer, but read
 * live from GitHub in one GraphQL query per repository instead of from the
 * PR watcher's snapshot, which the runtime doesn't have. It only reads:
 * queueing, dequeueing and jumping stay with whoever runs the queue.
 */

/**
 * The label that puts a pull request first for review and in the merge
 * queue. Kept as `queue_state` names it, so agents see the same answer.
 */
export const fastTrackLabel = "fast-track";

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
  /** `ci-ok` on the group's commit; `not formed` before GitHub made one. */
  readonly groupCiOk: CheckState | "not formed";
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
  /** Merge-group jobs queued for a runner, each group commit counted once. */
  readonly runnerWait: { readonly jobs: number; readonly longestMinutes: number | null };
  readonly fastTrack: readonly FastTrackRow[];
}

/** What the action returns as `data`, in `queue_state`'s shape. */
export interface QueueState {
  /** When GitHub was read: the time of the call. */
  readonly takenAt: string;
  /** Always 0 and never stale: the action reads GitHub live. Kept so the shape stays `queue_state`'s. */
  readonly ageMinutes: 0;
  readonly stale: false;
  readonly repos: readonly RepoQueueState[];
  /** Repositories after the first that the token doesn't reach. */
  readonly unread: readonly string[];
}

function minutesBetween(from: string, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - Date.parse(from)) / 60_000));
}

/** The task a branch names, only for a branch in the repository itself: a fork's name proves nothing. */
function taskOf(
  repo: string,
  pull: { headRefName: string; headRepository: { nameWithOwner: string } | null },
) {
  return pull.headRepository?.nameWithOwner.toLowerCase() === repo.toLowerCase()
    ? taskOfBranch(pull.headRefName)
    : undefined;
}

type RollupNode = Rollup["contexts"]["nodes"][number];

/** The newest run of a check decides, and a cancelled or skipped run isn't red, as `checkState`. */
function newestOf(runs: readonly RollupNode[]): CheckState {
  const newest = [...runs].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0];
  if (newest === undefined) {
    return "missing";
  }
  if (newest.status?.toUpperCase() !== "COMPLETED") {
    return "pending";
  }
  const conclusion = newest.conclusion?.toUpperCase();
  if (conclusion === "SUCCESS") {
    return "success";
  }
  return conclusion === "CANCELLED" || conclusion === "SKIPPED" ? "pending" : "failure";
}

/**
 * `ci-ok` on a commit from its rollup. When the rollup holds more checks
 * than one page and `ci-ok` isn't on it, it asks the REST API instead.
 */
async function ciOkOn(
  get: GitHubGet,
  repo: string,
  sha: string,
  rollup: Rollup | null,
): Promise<CheckState> {
  const runs = (rollup?.contexts.nodes ?? []).filter((node) => node.name === ciOkName);
  if (runs.length === 0 && rollup?.contexts.pageInfo.hasNextPage === true) {
    return checkState(get, repo, sha, ciOkName);
  }
  return newestOf(runs);
}

/** Jobs waiting for a runner on one group commit. GitHub sets a queued run's `startedAt` to when it was queued. */
function waitingOn(rollup: Rollup | null): { jobs: number; since: string | undefined } {
  const queued = (rollup?.contexts.nodes ?? []).filter(
    (node) => node.status?.toUpperCase() === "QUEUED",
  );
  const since = queued.flatMap((node) => (node.startedAt == null ? [] : [node.startedAt])).sort();
  return { jobs: queued.length, since: since[0] };
}

/** The queue's entries in order, and the runner wait over their group commits. */
async function queueOf(get: GitHubGet, repo: string, found: QueueRepository, now: Date) {
  const nodes = [...(found.mergeQueue?.entries.nodes ?? [])]
    .filter((entry) => entry.pullRequest !== null)
    .sort((a, b) => a.position - b.position);
  // Entries in one group share its commit: its `ci-ok` and its waiting jobs count once.
  const groups = new Map<string, Promise<CheckState>>();
  const waits = new Map<string, ReturnType<typeof waitingOn>>();
  const entries = await Promise.all(
    nodes.map(async (entry): Promise<QueueRow> => {
      const pull = entry.pullRequest as NonNullable<typeof entry.pullRequest>;
      const head = entry.headCommit;
      let groupCiOk: QueueRow["groupCiOk"] = "not formed";
      if (head !== null) {
        if (!groups.has(head.oid)) {
          groups.set(head.oid, ciOkOn(get, repo, head.oid, head.statusCheckRollup));
          waits.set(head.oid, waitingOn(head.statusCheckRollup));
        }
        groupCiOk = await (groups.get(head.oid) as Promise<CheckState>);
      }
      return {
        number: pull.number,
        url: pull.url,
        task: taskOf(repo, pull),
        position: entry.position,
        state: entry.state,
        enqueuedBy: entry.enqueuer?.login ?? null,
        minutesInQueue: minutesBetween(entry.enqueuedAt, now),
        groupCiOk,
        estimatedMinutes:
          entry.estimatedTimeToMerge === null ? null : Math.round(entry.estimatedTimeToMerge / 60),
      };
    }),
  );
  const oldest = [...waits.values()].flatMap((wait) => wait.since ?? []).sort()[0];
  const runnerWait = {
    jobs: [...waits.values()].reduce((sum, wait) => sum + wait.jobs, 0),
    longestMinutes: oldest === undefined ? null : minutesBetween(oldest, now),
  };
  return { entries, runnerWait };
}

/** The open pull requests carrying the label, with who added it last. */
function fastTrackOf(get: GitHubGet, repo: string, found: QueueRepository) {
  return Promise.all(
    found.pullRequests.nodes.map(async (pull): Promise<FastTrackRow> => {
      const added = pull.timelineItems.nodes
        .filter((event) => event.label?.name === fastTrackLabel)
        .at(-1);
      const commit = pull.commits.nodes[0]?.commit ?? null;
      return {
        number: pull.number,
        url: pull.url,
        task: taskOf(repo, pull),
        addedBy: added?.actor?.login ?? null,
        addedAt: added?.createdAt ?? null,
        draft: pull.isDraft,
        ciOk:
          commit === null
            ? "missing"
            : await ciOkOn(get, repo, commit.oid, commit.statusCheckRollup),
        inQueue: pull.isInMergeQueue,
      };
    }),
  );
}

/**
 * GraphQL answers a repository the token can't see with "Could not resolve
 * to a Repository". Said as the REST reader says a 404, so `readUnlessHidden`
 * treats both alike; any other error stays as it is.
 */
function hiddenAs404(error: Error | undefined, repo: string): Error {
  if (error === undefined || /Could not resolve to a Repository/.test(error.message)) {
    return new Error(`GitHub: ${repo} answered 404.`);
  }
  return error;
}

/** One repository's queue state: one GraphQL query, and a REST read only for a long rollup. */
export async function repoQueueState(
  query: GitHubQuery,
  get: GitHubGet,
  repo: string,
  now: Date,
): Promise<RepoQueueState> {
  const [owner = "", name = ""] = repo.split("/");
  const data = (await query(mergeQueueQuery, { owner, name, label: fastTrackLabel }).catch(
    (error: Error) => {
      throw hiddenAs404(error, repo);
    },
  )) as { repository: QueueRepository | null };
  if (data.repository === null) {
    throw hiddenAs404(undefined, repo);
  }
  const [{ entries, runnerWait }, fastTrack] = await Promise.all([
    queueOf(get, repo, data.repository, now),
    fastTrackOf(get, repo, data.repository),
  ]);
  return { repo, entries, runnerWait, fastTrack };
}

/** The queue state of every repository the tool lists, as of `now`. */
export async function queueState(
  query: GitHubQuery,
  get: GitHubGet,
  repos: readonly string[],
  now: Date,
): Promise<QueueState> {
  const found: RepoQueueState[] = [];
  const unread: string[] = [];
  for (const [index, repo] of repos.entries()) {
    const state = await readUnlessHidden(() => repoQueueState(query, get, repo, now), index === 0);
    if (state === undefined) {
      unread.push(repo);
    } else {
      found.push(state);
    }
  }
  return { takenAt: now.toISOString(), ageMinutes: 0, stale: false, repos: found, unread };
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
  if (wait.jobs === 0) {
    return "no merge-group job waits for a runner";
  }
  return `${wait.jobs} merge-group jobs wait for a runner, the longest ${wait.longestMinutes ?? "?"} min`;
}

/** The queue state in lines an agent reads, as `queue_state` writes them. */
export function queueStateText(state: QueueState): string {
  const lines = [`Merge queue read from GitHub at ${amsterdamTime(state.takenAt)}.`];
  for (const repo of state.repos) {
    lines.push(`${repo.repo}: ${repo.entries.length} in the queue; ${waitText(repo.runnerWait)}.`);
    lines.push(...repo.entries.map(entryLine));
    lines.push(
      ...(repo.fastTrack.length === 0
        ? [`no open pull request carries ${fastTrackLabel}`]
        : repo.fastTrack.map(fastTrackLine)),
    );
  }
  lines.push(...state.unread.map((repo) => `Not read: ${repo}, the token doesn't reach it.`));
  return lines.join("\n");
}

/** Reads the merge queue of the tool's repositories. */
export const mergeQueueHandler: ActionHandler = {
  capabilities: [],
  run: async ({ tool, now, github, githubQuery }) => {
    if (tool.action.run !== "github.merge-queue") {
      return { error: `${tool.name}: runs ${tool.action.run}, not github.merge-queue.` };
    }
    const state = await queueState(await githubQuery(), await github(), repositoriesOf(tool), now);
    return { content: queueStateText(state), data: state };
  },
};
