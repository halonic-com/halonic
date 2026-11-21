import type { PullFacts } from "./decide.ts";
import { ciOk, type GitHubGet, inMergeQueue, latestReview } from "./github.ts";

interface Pull {
  readonly html_url: string;
  readonly state: "open" | "closed";
  readonly merged_at: string | null;
  readonly merge_commit_sha: string | null;
  readonly mergeable: boolean | null;
  readonly head: { readonly sha: string; readonly ref: string };
  readonly base: { readonly ref: string };
}

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

/** Reads one pull request's state, `ci-ok`, conflicts and newest review. */
export async function pullFacts(
  get: GitHubGet,
  ref: { repo: string; number: number },
  greenSince: BaseGreenSince,
): Promise<PullFacts> {
  const pull = (await get(`/repos/${ref.repo}/pulls/${ref.number}`)) as Pull;
  const common = {
    ...ref,
    url: pull.html_url,
    branch: pull.head.ref,
    head: pull.head.sha,
    ciOkOnHead: "missing",
    conflicting: false,
    inQueue: false,
    latestReview: undefined,
    landed: false,
  } as const;
  if (pull.merged_at !== null) {
    const mergeCommit = pull.merge_commit_sha ?? "";
    const landed =
      mergeCommit !== "" &&
      ((await ciOk(get, ref.repo, mergeCommit)) === "success" ||
        (await greenSince(ref.repo, pull.base.ref, mergeCommit)));
    return { ...common, state: "merged", landed };
  }
  if (pull.state === "closed") {
    return { ...common, state: "closed" };
  }
  // `mergeable` is null while GitHub is still working it out: not a conflict yet.
  const conflicting = pull.mergeable === false;
  const [ciOkOnHead, review, inQueue] = await Promise.all([
    ciOk(get, ref.repo, pull.head.sha),
    latestReview(get, ref.repo, ref.number, pull.head.sha),
    conflicting ? inMergeQueue(get, ref.repo, ref.number) : Promise.resolve(false),
  ]);
  return { ...common, state: "open", ciOkOnHead, conflicting, inQueue, latestReview: review };
}
