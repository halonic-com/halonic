import type { GitHubQuery } from "../snapshot/graphql.ts";
import { type CheckFallback, mergeCommitChecks } from "../snapshot/read.ts";
import type { OpenFacts, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import type { CheckState, PullFacts } from "./decide.ts";
import type { PullRef } from "./discover.ts";
import type { GitHubGet } from "./github.ts";

/** Says whether a green CI run on the base branch includes a merge commit. */
export type BaseGreenSince = (repo: string, base: string, mergeCommit: string) => Promise<boolean>;

/**
 * Finds the newest successful `ci.yml` push run of a base branch once per
 * repository and branch, and checks that its commit includes the merge
 * commit. The newest green run, not the branch's tip: when merges come fast,
 * the tip's run is often still going or cancelled. A merge-queue commit's
 * date is when its group formed, not when it landed, so this compares
 * commits, not dates.
 */
export function baseGreenSince(get: GitHubGet): BaseGreenSince {
  const greenHeads = new Map<string, Promise<string | undefined>>();
  return async (repo, base, mergeCommit) => {
    const key = `${repo} ${base}`;
    let greenHead = greenHeads.get(key);
    if (greenHead === undefined) {
      const branch = encodeURIComponent(base);
      greenHead = (
        get(
          `/repos/${repo}/actions/workflows/ci.yml/runs?branch=${branch}&event=push&status=success&per_page=1`,
        ) as Promise<{ workflow_runs?: { head_sha?: string }[] }>
      ).then((body) => body.workflow_runs?.[0]?.head_sha);
      greenHeads.set(key, greenHead);
    }
    const sha = await greenHead;
    if (sha === undefined) {
      return false;
    }
    const compare = (await get(`/repos/${repo}/compare/${mergeCommit}...${sha}`)) as {
      status?: string;
    };
    return compare.status === "ahead" || compare.status === "identical";
  };
}

/** A pull request's key in the facts map: `owner/name#123`. */
export function pullKey(ref: { readonly repo: string; readonly number: number }): string {
  return `${ref.repo}#${ref.number}`;
}

/** The facts of some pull requests, keyed by `pullKey`. */
export type PullFactsReader = (refs: readonly PullRef[]) => Promise<ReadonlyMap<string, PullFacts>>;

/**
 * The repositories whose base branch rule asks for an approving GitHub review
 * from an account other than the agents' shared one: `cloud`'s `main`
 * ("extra approval for unattributed changes", HAL-16864). There such a review
 * on the head is the approval the watcher counts, next to the signed ones.
 * On `halonic` only signed approvals count (HAL-14809).
 */
export const githubReviewRepos: ReadonlySet<string> = new Set(["halonic-com/cloud"]);

/** The newest standing GitHub approval on the head, on a repository that needs one. */
function githubApprovalOnHead(ref: PullRef, pull: SnapshotPull, open: OpenFacts) {
  if (!githubReviewRepos.has(ref.repo.toLowerCase())) {
    return undefined;
  }
  return (open.githubApprovals ?? []).findLast(({ head }) => head === pull.head);
}

function openPullFacts(ref: PullRef, pull: SnapshotPull, open: OpenFacts): PullFacts {
  const githubApproval = githubApprovalOnHead(ref, pull, open);
  const signed = open.approvals.map(({ by, head, rebaseOf }) =>
    rebaseOf === undefined ? { by, head } : { by, head, rebaseOf },
  );
  return {
    ...ref,
    url: pull.url,
    branch: pull.branch,
    head: pull.head,
    state: "open",
    ciOkOnHead: open.ciOk,
    draft: open.draft,
    conflicting: open.mergeable === "no",
    inQueue: open.inQueue,
    retargeted: open.baseChangedSincePush === true,
    ...(open.missingChecks === undefined ? {} : { missingChecks: open.missingChecks }),
    latestReview: open.finding ?? undefined,
    ...(open.headCommittedAt === undefined ? {} : { headCommittedAt: open.headCommittedAt }),
    ...(open.headCommittedByGitHub === true ? { headCommittedByGitHub: true } : {}),
    approvals: githubApproval === undefined ? signed : [...signed, githubApproval],
    ...(githubApproval === undefined ? {} : { githubApproval }),
    landed: false,
    mergedAt: undefined,
  };
}

/**
 * Facts from the pass's snapshot. Only a merged pull request costs more:
 * `ci-ok` on its merge commit, read for all of them in one batch per
 * repository, and the base branch's newest green run for one that has none.
 */
export function snapshotFacts(options: {
  readonly snapshot: Snapshot;
  readonly query: GitHubQuery;
  readonly fallback: CheckFallback;
  readonly greenSince: BaseGreenSince;
}): PullFactsReader {
  const pulls = new Map(
    options.snapshot.repos.flatMap(({ repo, pulls: list }) =>
      list.map((pull) => [pullKey({ repo, number: pull.number }), pull] as const),
    ),
  );
  return async (refs) => {
    const found = refs.map((ref) => {
      const pull = pulls.get(pullKey(ref));
      if (pull === undefined) {
        throw new Error(`${pullKey(ref)} isn't in the snapshot.`);
      }
      return { ref, pull };
    });
    const mergeCommits = new Map<string, string[]>();
    for (const { ref, pull } of found) {
      if (pull.state === "merged" && pull.mergeCommit !== null) {
        mergeCommits.set(ref.repo, [...(mergeCommits.get(ref.repo) ?? []), pull.mergeCommit]);
      }
    }
    const checks = new Map<string, CheckState>();
    for (const [repo, commits] of mergeCommits) {
      for (const [sha, state] of await mergeCommitChecks(
        options.query,
        repo,
        commits,
        options.fallback,
      )) {
        checks.set(sha, state);
      }
    }
    const facts = new Map<string, PullFacts>();
    for (const { ref, pull } of found) {
      facts.set(pullKey(ref), await factsOf(ref, pull, checks, options.greenSince));
    }
    return facts;
  };
}

async function factsOf(
  ref: PullRef,
  pull: SnapshotPull,
  checks: ReadonlyMap<string, CheckState>,
  greenSince: BaseGreenSince,
): Promise<PullFacts> {
  if (pull.open !== null) {
    return openPullFacts(ref, pull, pull.open);
  }
  const closed = {
    ...ref,
    url: pull.url,
    branch: pull.branch,
    head: pull.head,
    ciOkOnHead: "missing",
    draft: false,
    conflicting: false,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    landed: false,
    mergedAt: undefined,
  } as const;
  if (pull.state !== "merged") {
    return { ...closed, state: "closed" };
  }
  const mergeCommit = pull.mergeCommit ?? "";
  const landed =
    mergeCommit !== "" &&
    (checks.get(mergeCommit) === "success" || (await greenSince(ref.repo, pull.base, mergeCommit)));
  return { ...closed, state: "merged", landed, mergedAt: pull.mergedAt ?? undefined };
}
