import type { GitHubGet } from "../pr-watcher/github.ts";
import type { PrioTask } from "../rules/queue-prio.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import { type BoundedCache, boundedCache } from "./facts-cache.ts";
import { type CapacitySources, type PlainGet, readCapacity } from "./facts-capacity.ts";
import {
  cancelsOf,
  groupRerunsOf,
  type ObservedCaches,
  pullRerunsOf,
  queueActionsOf,
} from "./facts-observed.ts";
import { gatePullOf, isGatePull, queueOf, runnerWaitOf } from "./facts-pulls.ts";
import {
  factsMergedQuery,
  factsPullsQuery,
  mainFileBatch,
  mainFilesQuery,
  type PullNode,
  type PullsPage,
  type QueueNode,
} from "./facts-query.ts";
import {
  ciOkRunOf,
  groupRunsOf,
  listRuns,
  mainRunsOf,
  manifestsOf,
  runFactOf,
} from "./facts-runs.ts";
import { mainFileOf } from "./gate.ts";
import type { ObservedAction } from "./shadow.ts";
import type { CiOkRun, FailedJob, GatePull, MergeSnapshot } from "./snapshot.ts";

/**
 * Merge control's facts reader (ADR on HAL-17700): one `MergeSnapshot` for
 * `decide` and the Merger's writes for shadow mode, per pass. GitHub is read
 * only through the query-only GraphQL reader and the GET-only REST reader,
 * with the read-only token (`pr-watcher-read-only`); capacity comes from the
 * two addresses in the settings, without a token. Patch-ids need git, which
 * the plugin doesn't have, so they are null and an approval never carries
 * over a rebase here.
 */

/** What the reader needs to know. */
export interface FactsSettings {
  readonly repo: string;
  /** The Merger's GitHub login; empty: nothing is observed. */
  readonly mergerLogin: string;
  readonly capacity: CapacitySources;
}

/** What the reader keeps between passes. */
export interface FactsCaches extends ObservedCaches {
  readonly failedJobs: BoundedCache<FailedJob[]>;
  readonly ciOkRuns: BoundedCache<CiOkRun | null>;
  readonly manifests: BoundedCache<GatePull["manifests"]>;
  readonly mainFiles: BoundedCache<{ readonly lines: number; readonly barrel: boolean } | null>;
}

/** Empty caches, one set per company. */
export function factsCaches(): FactsCaches {
  return {
    failedJobs: boundedCache(),
    ciOkRuns: boundedCache(),
    manifests: boundedCache(),
    mainFiles: boundedCache(),
    seenQueued: boundedCache(),
    cancelledBy: boundedCache(),
    rerunBy: boundedCache(),
  };
}

/** Everything the reader calls. */
export interface FactsDeps {
  readonly query: GitHubQuery;
  readonly get: GitHubGet;
  /** GETs a capacity address, without a token. */
  readonly plainGet: PlainGet;
  /** Paperclip's open tasks with their priority and "blocked by". */
  readonly tasks: () => Promise<PrioTask[]>;
  readonly settings: FactsSettings;
  readonly caches: FactsCaches;
  readonly log: (line: string) => void;
}

/** What one read gives. */
export interface ReadFacts {
  readonly snapshot: MergeSnapshot;
  readonly observed: readonly ObservedAction[];
}

function ownerAndName(repo: string): { owner: string; name: string } {
  const [owner = "", name = ""] = repo.split("/");
  return { owner, name };
}

/** Every open pull request, and from the first page the queue and `main`'s head. */
async function readPulls(deps: FactsDeps) {
  const names = ownerAndName(deps.settings.repo);
  const pulls: PullNode[] = [];
  let queue: readonly QueueNode[] = [];
  let main = { name: "main", sha: "" };
  for (let after: string | null = null, first = true; first || after !== null; first = false) {
    const page = (await deps.query(factsPullsQuery, {
      ...names,
      after,
      withQueue: first,
    })) as PullsPage;
    if (first) {
      const ref = page.repository.defaultBranchRef;
      main = { name: ref?.name ?? "main", sha: ref?.target.oid ?? "" };
      queue = page.repository.mergeQueue?.entries.nodes ?? [];
    }
    pulls.push(...page.repository.pullRequests.nodes);
    const { hasNextPage, endCursor } = page.repository.pullRequests.pageInfo;
    after = hasNextPage ? endCursor : null;
  }
  return { pulls, queue, main };
}

async function readMerged(deps: FactsDeps): Promise<MergeSnapshot["merged"]> {
  const data = (await deps.query(factsMergedQuery, ownerAndName(deps.settings.repo))) as {
    repository: { pullRequests: { nodes: { number: number; mergedAt: string | null }[] } };
  };
  return data.repository.pullRequests.nodes.flatMap((pull) =>
    pull.mergedAt === null ? [] : [{ number: pull.number, mergedAt: pull.mergedAt }],
  );
}

/**
 * Line counts on `main` of the files ready pull requests grow and `main`
 * already has; a file new on the branch starts at 0, which the gate assumes
 * for a file it has no count for.
 */
async function readMainFiles(
  deps: FactsDeps,
  pulls: readonly PullNode[],
  mainSha: string,
): Promise<MergeSnapshot["mainFiles"]> {
  const paths = new Set(
    pulls.flatMap((pull) =>
      (pull.files?.nodes ?? [])
        .filter((file) => file.changeType !== "ADDED" && file.changeType !== "DELETED")
        .filter((file) => file.additions > file.deletions)
        .map((file) => file.path),
    ),
  );
  const missing = [...paths].filter((path) => !deps.caches.mainFiles.has(`${mainSha}:${path}`));
  for (let start = 0; start < missing.length; start += mainFileBatch) {
    const batch = missing.slice(start, start + mainFileBatch);
    const variables = Object.fromEntries(
      batch.map((path, index) => [`e${index}`, `${mainSha}:${path}`]),
    );
    const data = (await deps.query(mainFilesQuery(batch.length), {
      ...ownerAndName(deps.settings.repo),
      ...variables,
    })) as { repository: Record<string, { text?: string | null; isBinary?: boolean } | null> };
    for (const [index, path] of batch.entries()) {
      const blob = data.repository[`f${index}`];
      const text = blob?.isBinary === false ? blob.text : undefined;
      deps.caches.mainFiles.set(
        `${mainSha}:${path}`,
        typeof text === "string" ? mainFileOf(text) : null,
      );
    }
  }
  const files: Record<string, { lines: number; barrel: boolean }> = {};
  for (const path of paths) {
    const file = deps.caches.mainFiles.get(`${mainSha}:${path}`);
    if (file != null) {
      files[path] = file;
    }
  }
  return files;
}

/** The gate's pull requests, with their manifests and red fast-track run. */
async function readGatePulls(deps: FactsDeps, pulls: readonly PullNode[]): Promise<GatePull[]> {
  const { get, settings, caches } = deps;
  const gate: GatePull[] = [];
  for (const node of pulls.filter(isGatePull)) {
    const pull = gatePullOf(node);
    gate.push({
      ...pull,
      manifests: await manifestsOf(get, settings.repo, pull, caches.manifests),
      ciOkRun: await ciOkRunOf(get, settings.repo, pull, caches.ciOkRuns),
    });
  }
  return gate;
}

async function readObserved(
  deps: FactsDeps,
  read: { pulls: readonly PullNode[]; queue: readonly QueueNode[] },
  runs: { groups: Parameters<typeof cancelsOf>[1]; queued: Parameters<typeof cancelsOf>[2] },
): Promise<ObservedAction[]> {
  const merger = deps.settings.mergerLogin;
  if (merger === "") {
    return [];
  }
  const options = { get: deps.get, repo: deps.settings.repo, merger, caches: deps.caches };
  return [
    ...queueActionsOf(merger, read.queue, read.pulls),
    ...groupRerunsOf(merger, runs.groups),
    ...(await pullRerunsOf(options, read.pulls)),
    ...(await cancelsOf(options, runs.groups, runs.queued)),
  ];
}

/** One pass's facts. A failed GitHub read fails the pass: `decide` never sees half a snapshot. */
export async function readMergeFacts(deps: FactsDeps, now: Date): Promise<ReadFacts> {
  const { get, settings } = deps;
  const read = await readPulls(deps);
  const day = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const groups = await listRuns(
    get,
    settings.repo,
    `event=merge_group&created=${encodeURIComponent(`>=${day}`)}`,
  );
  const queued = await listRuns(get, settings.repo, "event=pull_request&status=queued");
  const gate = await readGatePulls(deps, read.pulls);
  const capacity = await readCapacity(deps.plainGet, settings.capacity, groups, now);
  if (capacity.why !== undefined) {
    deps.log(`capacity unknown, counts as short: ${capacity.why}`);
  }
  const snapshot: MergeSnapshot = {
    takenAt: now.toISOString(),
    queue: queueOf(read.queue),
    pulls: gate,
    open: read.pulls.map((pull) => ({
      number: pull.number,
      branch: pull.headRefName,
      base: pull.baseRefName,
      head: pull.headRefOid,
    })),
    merged: await readMerged(deps),
    tasks: await deps.tasks(),
    mainFiles: await readMainFiles(deps, read.pulls.filter(isGatePull), read.main.sha),
    patchIds: Object.fromEntries(gate.map((pull) => [pull.head, null])),
    groupRuns: await groupRunsOf(get, settings.repo, groups, now, deps.caches.failedJobs),
    mergeGroupRuns: groups.map(runFactOf),
    queuedPullRuns: queued.map(runFactOf),
    runnerWaitMinutes: runnerWaitOf(read.queue, now),
    capacity: capacity.capacity,
    mainRuns: await mainRunsOf(get, settings.repo),
  };
  return { snapshot, observed: await readObserved(deps, read, { groups, queued }) };
}
