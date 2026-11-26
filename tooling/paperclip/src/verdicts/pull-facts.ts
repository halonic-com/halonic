import { type ChangedFile, readManifests, routedFromRest } from "../pr-tools/manifests.ts";
import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import { everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import { type CompareFile, changeIdOf } from "../pr-watcher/rebase-only.ts";
import { routedPaths, routineRefusal } from "../reviewer-paths.ts";
import { manifestFileOf } from "../reviewer-paths-manifest.ts";
import { pathReviewer } from "../reviewer-paths-who.ts";
import type { VerdictPullFacts } from "./review-verdict.ts";

/** The facts with what the gate also checks (HAL-19969): whether every changed file was read, and a manifest. */
export interface VerdictGateFacts extends VerdictPullFacts {
  /** How many files GitHub says it changes, and how many its files list gave. */
  readonly filesTotal: number;
  readonly filesRead: number;
  /** The first changed file that builds a plugin manifest, if any. */
  readonly manifestFile: string | undefined;
}

/**
 * What `review_verdict` reads about a pull request on GitHub, with GET
 * requests only: its head, branch and opener, the reviewer and Nora's limits
 * by the path rules (as `pr_status` works them out), and the fingerprint of its
 * whole diff against the merge base (`changeIdOf`), and whether every changed
 * file was listed. Three requests, plus two per changed package manifest.
 */
export async function readVerdictPull(
  get: GitHubGet,
  repo: string,
  pr: number,
): Promise<VerdictGateFacts> {
  const pull = (await get(`/repos/${repo}/pulls/${pr}`)) as PullDetails & {
    readonly user?: { readonly login?: string } | null;
    readonly changed_files?: number;
  };
  const head = pull.head.sha;
  const [files, compare] = await Promise.all([
    everyPage(get, `/repos/${repo}/pulls/${pr}/files`) as Promise<ChangedFile[]>,
    get(`/repos/${repo}/compare/${branchPath(pull.base.ref)}...${head}`) as Promise<{
      merge_base_commit?: { sha?: string };
      files?: CompareFile[];
    }>,
  ]);
  const manifests = await readManifests(get, repo, files, {
    base: compare?.merge_base_commit?.sha,
    head,
  });
  const routed = routedFromRest(pull, repo, files, manifests);
  return {
    state: pull.state === "open" && pull.merged_at === null ? "open" : "closed",
    head: head.toLowerCase(),
    branch: pull.head.ref,
    ownBranch: pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase(),
    openedBy: pull.user?.login ?? "",
    fingerprint: changeIdOf(compare?.files ?? []),
    reviewer: pathReviewer(routed),
    routineRefusal: routineRefusal(routed),
    // GitHub's files list stops at 3,000; without its total, the list counts as incomplete.
    filesTotal: pull.changed_files ?? files.length + 1,
    filesRead: files.length,
    manifestFile: manifestFileOf(routedPaths(routed)),
  };
}
