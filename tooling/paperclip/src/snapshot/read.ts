import { signedApprovals } from "../pr-tools/approvals.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import { closedWindowDays } from "../pr-watcher/discover.ts";
import { draftCiOkName, newestCheck, newestFinding, type Review } from "../pr-watcher/github.ts";
import type { GitHubQuery } from "./graphql.ts";
import { closedPullsQuery, commitBatchSize, commitChecksQuery, openPullsQuery } from "./queries.ts";
import {
  type OpenFacts,
  type QueueEntry,
  type Snapshot,
  type SnapshotLabel,
  type SnapshotPull,
  type SnapshotRepo,
  snapshotVersion,
} from "./shape.ts";

/**
 * Takes the snapshot: per repository, its merge queue and open pull requests
 * page by page, then closed ones until they are older than the window. About
 * 20 GraphQL calls on `halonic`, against some 450 REST requests before. The
 * queue comes with the first page of open pull requests, with each group
 * commit's `ci-ok` and its jobs waiting for a runner, so `queue_state` costs
 * no request of its own.
 */

/** Reads one check on a commit another way, for a commit with more than 100 checks. */
export type CheckFallback = (repo: string, sha: string, name: string) => Promise<CheckState>;

interface Page<T> {
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  readonly nodes: readonly T[];
}

interface Rollup {
  readonly contexts: Page<{
    readonly name?: string;
    readonly status?: string;
    readonly conclusion?: string | null;
    readonly startedAt?: string | null;
  }>;
}

interface PullNode {
  readonly number: number;
  readonly url: string;
  readonly state?: "CLOSED" | "MERGED";
  readonly updatedAt: string;
  readonly mergedAt?: string | null;
  readonly headRefName: string;
  readonly headRefOid: string;
  readonly baseRefName: string;
  readonly headRepository: { readonly nameWithOwner: string } | null;
  readonly mergeCommit?: { readonly oid: string } | null;
}

interface Comment {
  readonly databaseId: number;
  readonly body?: string;
  readonly createdAt: string;
  readonly authorAssociation: string;
  readonly commit?: { readonly oid: string } | null;
  readonly originalCommit?: { readonly oid: string } | null;
}

interface OpenNode extends PullNode {
  /** Null when the account is gone. Absent in recordings made before the field. */
  readonly author?: { readonly login: string } | null;
  readonly isDraft: boolean;
  readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  readonly isInMergeQueue: boolean;
  readonly labels: { readonly nodes: readonly { readonly name: string }[] };
  readonly timelineItems: {
    readonly nodes: readonly {
      readonly createdAt?: string;
      readonly label?: { readonly name: string };
      readonly actor?: { readonly login: string } | null;
    }[];
  };
  /** The newest base change, by hand or by GitHub when the base branch was deleted. Absent in recordings made before the field. */
  readonly baseChanges?: { readonly nodes: readonly { readonly createdAt?: string }[] };
  /** The newest reopen or force push. Absent in recordings made before the field. */
  readonly reopens?: { readonly nodes: readonly { readonly createdAt?: string }[] };
  readonly commits: {
    readonly nodes: readonly {
      readonly commit: {
        readonly committedDate?: string;
        readonly statusCheckRollup: Rollup | null;
      };
    }[];
  };
  readonly reviews: {
    readonly nodes: readonly (Comment & {
      readonly state: string;
      readonly submittedAt: string | null;
      readonly comments: { readonly nodes: readonly Comment[] };
    })[];
  };
  readonly comments: { readonly nodes: readonly Comment[] };
}

interface QueueNode {
  readonly position: number;
  readonly state: string;
  readonly enqueuedAt: string;
  readonly estimatedTimeToMerge: number | null;
  readonly solo: boolean;
  readonly enqueuer: { readonly login: string } | null;
  readonly headCommit: { readonly oid: string; readonly statusCheckRollup?: Rollup | null } | null;
  readonly pullRequest: { readonly number: number } | null;
}

interface OpenPage {
  readonly repository: {
    readonly defaultBranchRef: { readonly name: string } | null;
    /** Only on the first page, which asks for it. */
    readonly mergeQueue?: { readonly entries: { readonly nodes: readonly QueueNode[] } } | null;
    readonly pullRequests: Page<OpenNode>;
  };
}

function ownerAndName(repo: string): { owner: string; name: string } {
  const [owner = "", name = ""] = repo.split("/");
  return { owner, name };
}

type RollupNode = Rollup["contexts"]["nodes"][number];

function newestOf(runs: readonly RollupNode[]): CheckState {
  return newestCheck(
    runs.map((run) => ({
      status: run.status?.toLowerCase() ?? "",
      conclusion: run.conclusion?.toLowerCase() ?? null,
      started_at: run.startedAt ?? null,
    })),
  );
}

/** One check's result on a rollup, or undefined when the rollup was cut off before it. */
export function checkOf(rollup: Rollup | null, name: string): CheckState | undefined {
  const runs = (rollup?.contexts.nodes ?? []).filter((node) => node.name === name);
  if (runs.length === 0 && rollup?.contexts.pageInfo.hasNextPage === true) {
    return undefined;
  }
  return newestOf(runs);
}

/**
 * Whether a check's newest run finished without a verdict: skipped (a
 * path-filtered job, many on every `halonic` head) or neutral. Such a check
 * neither fails nor is still running.
 */
function settledWithoutVerdict(runs: readonly RollupNode[]): boolean {
  const newest = [...runs].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0];
  const conclusion = newest?.conclusion?.toLowerCase();
  return (
    newest?.status?.toLowerCase() === "completed" &&
    (conclusion === "skipped" || conclusion === "neutral")
  );
}

/**
 * The checks whose newest run failed and those still running, by name, of
 * the first 100 on a rollup. A skipped or neutral check is in neither list;
 * a cancelled one counts as still running.
 */
export function checksOf(rollup: Rollup | null): {
  failingChecks: string[];
  pendingChecks: string[];
} {
  const byName = new Map<string, RollupNode[]>();
  for (const node of rollup?.contexts.nodes ?? []) {
    if (node.name !== undefined) {
      byName.set(node.name, [...(byName.get(node.name) ?? []), node]);
    }
  }
  const states = [...byName]
    .filter(([, runs]) => !settledWithoutVerdict(runs))
    .map(([name, runs]) => [name, newestOf(runs)] as const);
  return {
    failingChecks: states.flatMap(([name, state]) => (state === "failure" ? [name] : [])).sort(),
    pendingChecks: states.flatMap(([name, state]) => (state === "pending" ? [name] : [])).sort(),
  };
}

const mergeableOf = { MERGEABLE: "yes", CONFLICTING: "no", UNKNOWN: "unknown" } as const;

function rest(comment: Comment): Review {
  return {
    id: comment.databaseId,
    body: comment.body ?? null,
    created_at: comment.createdAt,
    author_association: comment.authorAssociation,
    ...(comment.commit == null ? {} : { commit_id: comment.commit.oid }),
    ...(comment.originalCommit == null ? {} : { original_commit_id: comment.originalCommit.oid }),
  };
}

function labelsOf(node: OpenNode): SnapshotLabel[] {
  const events = node.timelineItems.nodes;
  return node.labels.nodes.map(({ name }) => {
    const added = events.findLast((event) => event.label?.name === name);
    return { name, addedBy: added?.actor?.login ?? null, addedAt: added?.createdAt ?? null };
  });
}

/**
 * Its base became the default branch, or changed on it, after it was last
 * reopened or pushed to. GitHub runs a ruleset's required workflow only on
 * opened, synchronize and reopened, never on a base change, so such a pull
 * request stays blocked with its checks green until it is reopened or pushed
 * to (HAL-16394). It compares with the reopen or push, not with the note
 * check: the repository's own copy of that workflow also runs on `edited`,
 * under the same name, and that run doesn't clear the block. A push is read
 * from the head commit's date, so pushing an older commit wakes the author
 * once too often, never once too few.
 */
function baseChangedSincePush(node: OpenNode, defaultBranch: string): boolean {
  const changedAt = node.baseChanges?.nodes.at(-1)?.createdAt;
  if (changedAt === undefined || node.baseRefName !== defaultBranch) {
    return false;
  }
  const touches = [
    node.reopens?.nodes.at(-1)?.createdAt,
    node.commits.nodes[0]?.commit.committedDate,
  ].flatMap((at) => (at === undefined ? [] : [Date.parse(at)]));
  return touches.every((at) => at < Date.parse(changedAt));
}

async function openFacts(
  node: OpenNode,
  repo: string,
  defaultBranch: string,
  fallback: CheckFallback,
): Promise<OpenFacts> {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
  const check = async (name: string) =>
    checkOf(rollup, name) ?? (await fallback(repo, node.headRefOid, name));
  const reviews = node.reviews.nodes;
  const conversation = node.comments.nodes.map(rest);
  return {
    draft: node.isDraft,
    mergeable: mergeableOf[node.mergeable],
    ciOk: await check("ci-ok"),
    draftCiOk: await check(draftCiOkName),
    inQueue: node.isInMergeQueue,
    labels: labelsOf(node),
    finding:
      newestFinding(
        {
          reviews: reviews.map((review) => ({
            ...rest(review),
            state: review.state,
            submitted_at: review.submittedAt ?? "",
          })),
          inline: reviews.flatMap((review) => review.comments.nodes.map(rest)),
          conversation,
        },
        node.headRefOid,
      ) ?? null,
    approvals: signedApprovals(conversation),
    baseChangedSincePush: baseChangedSincePush(node, defaultBranch),
    ...(node.author === undefined ? {} : { author: node.author?.login ?? null }),
    ...checksOf(rollup),
  };
}

function pullOf(node: PullNode, open: OpenFacts | null): SnapshotPull {
  let state: SnapshotPull["state"] = node.state === "MERGED" ? "merged" : "closed";
  if (open !== null) {
    state = "open";
  }
  return {
    number: node.number,
    url: node.url,
    state,
    branch: node.headRefName,
    headRepo: node.headRepository?.nameWithOwner ?? null,
    base: node.baseRefName,
    head: node.headRefOid,
    updatedAt: node.updatedAt,
    mergedAt: node.mergedAt ?? null,
    mergeCommit: node.mergeCommit?.oid ?? null,
    open,
  };
}

/** A group commit's jobs queued for a runner, and since when the longest one waits. */
function waitingOf(rollup: Rollup | null): { jobsWaiting: number; waitingSince: string | null } {
  const queued = (rollup?.contexts.nodes ?? []).filter((node) => node.status === "QUEUED");
  // GitHub sets a queued check run's `startedAt` to when it was queued.
  const since = queued.flatMap((node) => (node.startedAt == null ? [] : [node.startedAt])).sort();
  return { jobsWaiting: queued.length, waitingSince: since[0] ?? null };
}

async function queueOf(page: OpenPage, repo: string, fallback: CheckFallback) {
  const entries: QueueEntry[] = [];
  // Entries in one group share its commit: its `ci-ok` is read once.
  const groupChecks = new Map<string, CheckState>();
  for (const entry of page.repository.mergeQueue?.entries.nodes ?? []) {
    if (entry.pullRequest === null) {
      continue;
    }
    const groupHead = entry.headCommit?.oid ?? null;
    const rollup = entry.headCommit?.statusCheckRollup ?? null;
    let groupCiOk: QueueEntry["groupCiOk"] = null;
    if (groupHead !== null) {
      groupCiOk =
        checkOf(rollup, "ci-ok") ??
        groupChecks.get(groupHead) ??
        (await fallback(repo, groupHead, "ci-ok"));
      groupChecks.set(groupHead, groupCiOk);
    }
    entries.push({
      number: entry.pullRequest.number,
      position: entry.position,
      state: entry.state,
      enqueuedAt: entry.enqueuedAt,
      enqueuedBy: entry.enqueuer?.login ?? null,
      groupHead,
      estimatedSeconds: entry.estimatedTimeToMerge,
      solo: entry.solo,
      groupCiOk,
      ...waitingOf(rollup),
    });
  }
  return entries;
}

async function readRepo(
  query: GitHubQuery,
  repo: string,
  since: number,
  fallback: CheckFallback,
): Promise<SnapshotRepo> {
  const names = ownerAndName(repo);
  const pulls: SnapshotPull[] = [];
  let defaultBranch = "main";
  let queue: QueueEntry[] = [];
  for (let after: string | null = null, first = true; first || after !== null; first = false) {
    const page = (await query(openPullsQuery, { ...names, after, withQueue: first })) as OpenPage;
    if (first) {
      defaultBranch = page.repository.defaultBranchRef?.name ?? defaultBranch;
      queue = await queueOf(page, repo, fallback);
    }
    for (const node of page.repository.pullRequests.nodes) {
      pulls.push(pullOf(node, await openFacts(node, repo, defaultBranch, fallback)));
    }
    const { hasNextPage, endCursor } = page.repository.pullRequests.pageInfo;
    after = hasNextPage ? endCursor : null;
  }
  for (let after: string | null = null, more = true; more; ) {
    const page = (await query(closedPullsQuery, { ...names, after })) as {
      repository: { pullRequests: Page<PullNode> };
    };
    const { nodes, pageInfo } = page.repository.pullRequests;
    const recent = nodes.filter((node) => Date.parse(node.updatedAt) >= since);
    pulls.push(...recent.map((node) => pullOf(node, null)));
    more = pageInfo.hasNextPage && recent.length === nodes.length;
    after = pageInfo.endCursor;
  }
  return { repo, defaultBranch, queue, pulls };
}

/** One snapshot of every repository. A failed call fails the whole snapshot: no partial views. */
export async function takeSnapshot(options: {
  query: GitHubQuery;
  repos: readonly string[];
  now: Date;
  fallback: CheckFallback;
}): Promise<Snapshot> {
  const since = options.now.getTime() - closedWindowDays * 24 * 60 * 60 * 1000;
  const repos: SnapshotRepo[] = [];
  for (const repo of options.repos) {
    repos.push(await readRepo(options.query, repo, since, options.fallback));
  }
  return {
    version: snapshotVersion,
    takenAt: options.now.toISOString(),
    closedWindowDays,
    repos,
  };
}

/**
 * `ci-ok` on merge commits, read only for the merged pull requests a
 * decision needs, `commitBatchSize` commits per call.
 */
export async function mergeCommitChecks(
  query: GitHubQuery,
  repo: string,
  commits: readonly string[],
  fallback: CheckFallback,
): Promise<Map<string, CheckState>> {
  const found = new Map<string, CheckState>();
  const unique = [...new Set(commits)];
  for (let start = 0; start < unique.length; start += commitBatchSize) {
    const batch = unique.slice(start, start + commitBatchSize);
    const variables = Object.fromEntries(batch.map((sha, index) => [`c${index}`, sha]));
    const data = (await query(commitChecksQuery(batch.length), {
      ...ownerAndName(repo),
      ...variables,
    })) as { repository: Record<string, { statusCheckRollup?: Rollup | null } | null> };
    for (const [index, sha] of batch.entries()) {
      const rollup = data.repository[`c${index}`]?.statusCheckRollup ?? null;
      found.set(sha, checkOf(rollup, "ci-ok") ?? (await fallback(repo, sha, "ci-ok")));
    }
  }
  return found;
}
