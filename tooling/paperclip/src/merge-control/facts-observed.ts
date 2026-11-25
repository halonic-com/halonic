import type { GitHubGet } from "../pr-watcher/github.ts";
import { type BoundedCache, cached } from "./facts-cache.ts";
import type { PullNode, QueueNode } from "./facts-query.ts";
import type { RestRun } from "./facts-runs.ts";
import type { ObservedAction } from "./shadow.ts";
import { noteKindOf } from "./shadow-reasons.ts";

/**
 * What the Merger did, read from GitHub, for shadow mode's diff. The
 * Merger's login comes from the settings and is never written in the repo
 * (board rule HAL-16851). Each kind comes from where GitHub records it:
 *
 * - enqueue: the queue entries' `enqueuer`, and the timeline's
 *   "added to merge queue" by that login. GitHub doesn't record a jump, so
 *   an entry ahead of one queued before it counts as a jump;
 * - dequeue: the timeline's "removed from merge queue" by that login;
 * - comment: the pull request comments by that login; a queue-manager note
 *   on the current head also carries its kind, for the diff's reasons;
 * - rerun: a run whose newest attempt that login started, from the Actions
 *   runs; only the failed jobs if some of its jobs kept their first attempt;
 * - cancel-run: a run seen queued that ended cancelled, when its job's
 *   annotation says that login cancelled it.
 */

/** What the reader keeps between passes for this. */
export interface ObservedCaches {
  /** Run ids seen queued, so a later cancel is looked at once. */
  readonly seenQueued: BoundedCache<true>;
  /** Who cancelled a run, or null when no annotation says. */
  readonly cancelledBy: BoundedCache<string | null>;
  /** Who started a run's attempt, by run and attempt. */
  readonly rerunBy: BoundedCache<{ readonly login: string | null; readonly at: string }>;
}

/** Queue entries ahead of one queued before them jumped. */
function jumpedOf(queue: readonly QueueNode[]): Set<number> {
  const jumped = new Set<number>();
  for (const entry of queue) {
    const passed = queue.some(
      (other) => other.position > entry.position && other.enqueuedAt < entry.enqueuedAt,
    );
    if (passed && entry.pullRequest !== null) {
      jumped.add(entry.pullRequest.number);
    }
  }
  return jumped;
}

/** Enqueues, dequeues and comments, from the queue and the open pull requests. */
export function queueActionsOf(
  merger: string,
  queue: readonly QueueNode[],
  pulls: readonly PullNode[],
): ObservedAction[] {
  const jumped = jumpedOf(queue);
  const actions: ObservedAction[] = queue.flatMap((entry) =>
    entry.enqueuer?.login === merger && entry.pullRequest !== null
      ? [
          {
            kind: "enqueue" as const,
            number: entry.pullRequest.number,
            jump: jumped.has(entry.pullRequest.number),
            at: entry.enqueuedAt,
          },
        ]
      : [],
  );
  return [...actions, ...pulls.flatMap((pull) => pullActionsOf(merger, pull))];
}

/** One pull request's queue events and comments by the Merger. */
function pullActionsOf(merger: string, pull: PullNode): ObservedAction[] {
  const actions: ObservedAction[] = [];
  for (const item of pull.timelineItems.nodes) {
    if (item.actor?.login !== merger || item.createdAt === undefined) {
      continue;
    }
    if (item.__typename === "AddedToMergeQueueEvent") {
      actions.push({ kind: "enqueue", number: pull.number, jump: false, at: item.createdAt });
    } else if (item.__typename === "RemovedFromMergeQueueEvent") {
      actions.push({ kind: "dequeue", number: pull.number, at: item.createdAt });
    }
  }
  for (const comment of pull.comments.nodes) {
    if (comment.author?.login === merger) {
      const note = noteOf(pull, comment);
      actions.push({
        kind: "comment",
        number: pull.number,
        at: comment.createdAt,
        ...(note === undefined ? {} : { note }),
      });
    }
  }
  return actions;
}

/**
 * A queue-manager note's kind, when it is on the pull request's current
 * head: it names that head in backticks, or names none and came after the
 * head's commit.
 */
function noteOf(
  pull: PullNode,
  comment: PullNode["comments"]["nodes"][number],
): { kind: string; head: string } | undefined {
  const kind = noteKindOf(comment.body);
  if (kind === undefined) {
    return undefined;
  }
  const named = [...comment.body.matchAll(/`([0-9a-f]{7,40})`/g)].pop()?.[1];
  const committed = pull.commits.nodes[0]?.commit.committedDate ?? pull.createdAt;
  const onHead =
    named === undefined ? comment.createdAt >= committed : pull.headRefOid.startsWith(named);
  return onHead ? { kind, head: pull.headRefOid } : undefined;
}

const cancelledLine = /cancel+ed by @?([\w-]+)/i;

/**
 * Who cancelled a run, from a cancelled job's annotations: GitHub notes a
 * cancel by hand or by API as "The run was canceled by @<login>.", and one
 * by a concurrency group without a login.
 */
async function cancellerOf(get: GitHubGet, repo: string, runId: number): Promise<string | null> {
  const body = (await get(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`)) as {
    jobs?: { id: number; conclusion: string | null }[];
  };
  const job = body.jobs?.find((each) => each.conclusion === "cancelled");
  if (job === undefined) {
    return null;
  }
  const annotations = (await get(
    `/repos/${repo}/check-runs/${job.id}/annotations?per_page=20`,
  )) as {
    message?: string;
  }[];
  for (const annotation of annotations) {
    const match = cancelledLine.exec(annotation.message ?? "");
    if (match !== null) {
      return match[1] ?? null;
    }
  }
  return null;
}

/**
 * Cancels by the Merger: runs seen queued in an earlier pass that are now
 * cancelled. Merge-group runs come from the pass's list; a pull request run
 * that left the queued list is read once.
 */
export async function cancelsOf(
  options: { get: GitHubGet; repo: string; merger: string; caches: ObservedCaches },
  groupRuns: readonly RestRun[],
  queuedPullRuns: readonly RestRun[],
): Promise<ObservedAction[]> {
  const { get, repo, merger, caches } = options;
  const queuedNow = new Set(queuedPullRuns.map((run) => run.id));
  const candidates: RestRun[] = groupRuns.filter(
    (run) => run.conclusion === "cancelled" && caches.seenQueued.has(String(run.id)),
  );
  for (const run of [...groupRuns, ...queuedPullRuns]) {
    if (run.status === "queued") {
      caches.seenQueued.set(String(run.id), true);
    } else if (run.conclusion !== "cancelled" && caches.seenQueued.has(String(run.id))) {
      // Ran: nothing to look up for it, now or once it leaves the list.
      caches.cancelledBy.set(String(run.id), null);
    }
  }
  const actions: ObservedAction[] = [];
  for (const run of candidates) {
    const by = await cached(caches.cancelledBy, String(run.id), () =>
      cancellerOf(get, repo, run.id),
    );
    if (by === merger) {
      actions.push({ kind: "cancel-run", runId: run.id, at: run.updated_at });
    }
  }
  return [...actions, ...(await leftQueue(options, queuedNow, groupRuns))];
}

/** Pull request runs seen queued before that aren't queued now: read once each. */
async function leftQueue(
  options: { get: GitHubGet; repo: string; merger: string; caches: ObservedCaches },
  queuedNow: ReadonlySet<number>,
  groupRuns: readonly RestRun[],
): Promise<ObservedAction[]> {
  const { get, repo, merger, caches } = options;
  const known = new Set(groupRuns.map((run) => run.id));
  const actions: ObservedAction[] = [];
  for (const id of caches.seenQueued.keys()) {
    const runId = Number(id);
    if (queuedNow.has(runId) || known.has(runId) || caches.cancelledBy.has(id)) {
      continue;
    }
    const run = (await get(`/repos/${repo}/actions/runs/${runId}`)) as RestRun;
    // A run that started wasn't cancelled while queued, the only cancel the Merger makes.
    const by = run.conclusion === "cancelled" ? await cancellerOf(get, repo, runId) : null;
    caches.cancelledBy.set(id, by);
    if (by === merger) {
      actions.push({ kind: "cancel-run", runId, at: run.updated_at });
    }
  }
  return actions;
}

/** Reruns of merge-group runs whose newest attempt the Merger started. */
export function groupRerunsOf(merger: string, groupRuns: readonly RestRun[]): ObservedAction[] {
  return groupRuns.flatMap((run) =>
    (run.run_attempt ?? 1) > 1 && run.triggering_actor?.login === merger
      ? [{ kind: "rerun" as const, runId: run.id, at: run.run_started_at ?? run.updated_at }]
      : [],
  );
}

/**
 * Reruns of pull request `CI` runs. A rerun adds a second check run of the
 * same name to the same run, so only such runs are read, once per attempt.
 */
export async function pullRerunsOf(
  options: { get: GitHubGet; repo: string; merger: string; caches: ObservedCaches },
  pulls: readonly PullNode[],
): Promise<ObservedAction[]> {
  const { get, repo, merger, caches } = options;
  const actions: ObservedAction[] = [];
  for (const [runId, counts] of pulls.flatMap(ciRunsOf)) {
    const attempts = Math.max(...counts);
    if (attempts < 2) {
      continue;
    }
    const started = await cached(caches.rerunBy, `${runId}:${attempts}`, async () => {
      const run = (await get(`/repos/${repo}/actions/runs/${runId}`)) as RestRun;
      return {
        login: run.triggering_actor?.login ?? null,
        at: run.run_started_at ?? run.updated_at,
      };
    });
    if (started.login === merger) {
      const kind = counts.every((count) => count >= 2) ? "rerun" : "rerun-failed-jobs";
      actions.push({ kind, runId, at: started.at });
    }
  }
  return actions;
}

/** Each `CI` run on the head, with how many check runs each of its jobs has. */
function ciRunsOf(pull: PullNode): [number, number[]][] {
  const runs = new Map<number, Map<string, number>>();
  for (const run of pull.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []) {
    const workflowRun = run.checkSuite?.workflowRun;
    if (workflowRun?.workflow.name !== "CI" || run.name === undefined) {
      continue;
    }
    const names = runs.get(workflowRun.databaseId) ?? new Map<string, number>();
    names.set(run.name, (names.get(run.name) ?? 0) + 1);
    runs.set(workflowRun.databaseId, names);
  }
  return [...runs].map(([runId, names]) => [runId, [...names.values()]]);
}
