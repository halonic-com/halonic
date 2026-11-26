import type { FactsRollup, PullNode, QueueNode, RollupRun } from "./facts-query.ts";
import type { CheckFact, GatePull, PullText, QueueEntry, QueueEntryState } from "./snapshot.ts";

/**
 * Turns `factsPullsQuery`'s answers into the snapshot's pull requests and
 * queue entries. Pure: the reader adds what needs a REST read (manifests,
 * the red fast-track run) afterwards.
 */

/**
 * The labels that make an open pull request one the gate looks at, alike:
 * built on Paperclip or in Halonic (HAL-18470, the live Merger's `BUILT_ON`
 * since 25 Nov 12:02 UTC). `fast-track` still counts only from a configured
 * labeller, whichever of the two it carries.
 */
export const builtOnLabels: ReadonlySet<string> = new Set([
  "built-on:paperclip",
  "built-on:halonic",
]);

/** Whether the labels include one of `builtOnLabels`. */
export function isBuiltOn(labels: readonly string[]): boolean {
  return labels.some((label) => builtOnLabels.has(label));
}

const checkStatuses: Readonly<Record<string, CheckFact["status"]>> = {
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
};

/** A rollup's check run as the gate reads it; a run outside Actions has no workflow or event. */
export function checkFactOf(run: RollupRun): CheckFact {
  const workflowRun = run.checkSuite?.workflowRun ?? null;
  return {
    name: run.name ?? "",
    workflow: workflowRun?.workflow.name ?? "",
    event: workflowRun?.event ?? "",
    // Queued, waiting, pending and requested all mean it hasn't started.
    status: checkStatuses[run.status ?? ""] ?? "queued",
    conclusion: run.conclusion?.toLowerCase() ?? null,
    runCreatedAt: workflowRun?.createdAt ?? run.startedAt ?? "",
    startedAt: run.startedAt ?? null,
    url: run.detailsUrl ?? "",
  };
}

function rollupOf(node: PullNode): FactsRollup | null {
  return node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
}

/** `live-cloud`'s runs; null when the rollup was cut off before any of them. */
function liveCloudOf(rollup: FactsRollup | null, checks: readonly CheckFact[]) {
  const runs = checks.filter((check) => check.name === "live-cloud");
  if (runs.length === 0 && rollup?.contexts.pageInfo?.hasNextPage === true) {
    return null;
  }
  return runs;
}

/** The newest `pull_request` run of `CI` on the head. */
function ciRunOf(rollup: FactsRollup | null): GatePull["ciRun"] {
  const runs = (rollup?.contexts.nodes ?? []).flatMap((run) => {
    const workflowRun = run.checkSuite?.workflowRun;
    return workflowRun?.workflow.name === "CI" && workflowRun.event === "pull_request"
      ? [
          {
            id: workflowRun.databaseId,
            status: (run.checkSuite?.status ?? "").toLowerCase(),
            createdAt: workflowRun.createdAt,
          },
        ]
      : [];
  });
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function textsOf(node: PullNode): PullText[] {
  const comments = node.comments.nodes.map(
    (comment): PullText => ({
      kind: "comment",
      by: comment.author?.login ?? "",
      at: comment.createdAt,
      body: comment.body,
    }),
  );
  const reviews = node.reviews.nodes.flatMap((review): PullText[] =>
    // A pending review has no time and nobody else sees it yet.
    review.submittedAt === null
      ? []
      : [
          {
            kind: "review",
            by: review.author?.login ?? "",
            at: review.submittedAt,
            body: review.body,
            reviewState: review.state,
            ...(review.commit === null ? {} : { commit: review.commit.oid }),
          },
        ],
  );
  return [...comments, ...reviews];
}

function timesOf(node: PullNode, types: readonly string[]): string[] {
  return node.timelineItems.nodes.flatMap((item) =>
    types.includes(item.__typename) && item.createdAt !== undefined ? [item.createdAt] : [],
  );
}

function fastTrackByOf(node: PullNode): string | null {
  const added = node.timelineItems.nodes.findLast(
    (item) => item.__typename === "LabeledEvent" && item.label?.name === "fast-track",
  );
  return added?.actor?.login ?? null;
}

const queueEvents = ["AddedToMergeQueueEvent", "RemovedFromMergeQueueEvent"];

function queueExitOf(node: PullNode): GatePull["queueExit"] {
  const last = node.timelineItems.nodes
    .filter((item) => queueEvents.includes(item.__typename) && item.createdAt !== undefined)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .pop();
  if (last?.__typename !== "RemovedFromMergeQueueEvent" || last.createdAt === undefined) {
    return null;
  }
  return { at: last.createdAt, reason: (last.reason ?? "").toUpperCase() };
}

function filesOf(
  node: PullNode,
): Pick<GatePull, "files" | "filesTotal" | "fileNet" | "previousPaths"> {
  const files = node.files?.nodes ?? [];
  const fileNet: Record<string, number> = {};
  const previousPaths: Record<string, string | null> = {};
  for (const file of files) {
    if (file.changeType !== "DELETED") {
      fileNet[file.path] = file.additions - file.deletions;
    }
    // GraphQL names no old path: the reader asks REST for it (`previousPathsOf`).
    if (file.changeType === "RENAMED") {
      previousPaths[file.path] = null;
    }
  }
  return {
    files: files.map((file) => file.path),
    filesTotal: node.changedFiles,
    fileNet,
    ...(Object.keys(previousPaths).length === 0 ? {} : { previousPaths }),
  };
}

/** Whether one of the labels is a `built-on:*` label, a known one or not. */
export function hasBuiltOnLabel(labels: readonly string[]): boolean {
  return labels.some((label) => label.startsWith("built-on:"));
}

/**
 * Whether the gate looks at it: queued, labelled `built-on:paperclip` or
 * `built-on:halonic`, or a non-draft one by one of `autoLabelAuthors` with
 * no `built-on:*` label, which the auto-label rule may label (HAL-18506).
 */
export function isGatePull(node: PullNode, autoLabelAuthors: readonly string[] = []): boolean {
  const labels = node.labels.nodes.map((label) => label.name);
  if (node.isInMergeQueue || isBuiltOn(labels)) {
    return true;
  }
  const author = node.author?.login;
  return (
    !node.isDraft &&
    !hasBuiltOnLabel(labels) &&
    author !== undefined &&
    autoLabelAuthors.includes(author)
  );
}

/**
 * A gate pull request without its manifests, renamed files' old paths and
 * red fast-track run, which need REST reads.
 */
export function gatePullOf(node: PullNode): GatePull {
  const rollup = rollupOf(node);
  const checks = (rollup?.contexts.nodes ?? [])
    .filter((run) => run.name !== undefined)
    .map(checkFactOf);
  return {
    number: node.number,
    id: node.id,
    title: node.title,
    ...(node.body === undefined ? {} : { body: node.body }),
    author: node.author?.login ?? null,
    branch: node.headRefName,
    base: node.baseRefName,
    head: node.headRefOid,
    createdAt: node.createdAt,
    draft: node.isDraft,
    labels: node.labels.nodes.map((label) => label.name),
    crossRepository: node.isCrossRepository,
    headOwner: node.headRepositoryOwner?.login ?? null,
    additions: node.additions,
    deletions: node.deletions,
    mergeable: node.mergeable,
    mergeStateStatus: node.mergeStateStatus,
    ...filesOf(node),
    manifests: undefined,
    headCommittedAt: node.commits.nodes[0]?.commit.committedDate ?? node.createdAt,
    forcePushedAt: timesOf(node, ["HeadRefForcePushedEvent"]),
    retargetedAt: timesOf(node, ["BaseRefChangedEvent", "AutomaticBaseChangeSucceededEvent"]),
    queueExit: queueExitOf(node),
    texts: textsOf(node),
    checks,
    liveCloud: liveCloudOf(rollup, checks),
    ciRun: ciRunOf(rollup),
    fastTrackBy: fastTrackByOf(node),
    ciOkRun: null,
  };
}

const entryStates: readonly QueueEntryState[] = [
  "QUEUED",
  "AWAITING_CHECKS",
  "MERGEABLE",
  "UNMERGEABLE",
  "LOCKED",
];

/** The queue's entries; one GitHub lists without a pull request is left out. */
export function queueOf(nodes: readonly QueueNode[]): QueueEntry[] {
  return nodes.flatMap((node) =>
    node.pullRequest === null
      ? []
      : [
          {
            number: node.pullRequest.number,
            position: node.position,
            state: entryStates.find((state) => state === node.state) ?? "QUEUED",
            enqueuedAt: node.enqueuedAt,
            groupHead: node.headCommit?.oid ?? null,
          },
        ],
  );
}

/**
 * The longest wait of a queued merge-group job for a runner, in minutes. A
 * queued check run's `startedAt` is when it was queued; a job waiting on
 * another job has no check run yet, so it doesn't count.
 */
export function runnerWaitOf(nodes: readonly QueueNode[], now: Date): number {
  const since = nodes.flatMap((node) =>
    (node.headCommit?.statusCheckRollup?.contexts.nodes ?? []).flatMap((run) =>
      run.status === "QUEUED" && typeof run.startedAt === "string"
        ? [Date.parse(run.startedAt)]
        : [],
    ),
  );
  if (since.length === 0) {
    return 0;
  }
  return Math.max(0, (now.getTime() - Math.min(...since)) / 60_000);
}
