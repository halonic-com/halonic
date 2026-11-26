import { type ChangedFile, linesByFile, readManifests } from "../pr-tools/manifests.ts";
import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import { everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import { type CompareFile, changeIdOf } from "../pr-watcher/rebase-only.ts";
import { type RoutedPull, reviewerFor, reviewerRoleFor } from "../reviewer-paths.ts";
import type { VerdictPullFacts } from "./review-verdict.ts";

/**
 * What `review_verdict` reads about a pull request on GitHub, with GET
 * requests only: its head, branch and opener, the reviewer and role by the
 * path rules (as `pr_status` works them out), and the fingerprint of its
 * whole diff against the merge base (`changeIdOf`). Three requests, plus two
 * per changed package manifest.
 */
export async function readVerdictPull(
  get: GitHubGet,
  repo: string,
  pr: number,
): Promise<VerdictPullFacts> {
  const pull = (await get(`/repos/${repo}/pulls/${pr}`)) as PullDetails & {
    readonly user?: { readonly login?: string } | null;
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
  const routed: RoutedPull = {
    files: files.map((file) => file.filename),
    changedLines: (pull.additions ?? 0) + (pull.deletions ?? 0),
    sensitive: false,
    manifests,
    fileLines: linesByFile(files),
  };
  return {
    state: pull.state === "open" && pull.merged_at === null ? "open" : "closed",
    head: head.toLowerCase(),
    branch: pull.head.ref,
    ownBranch: pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase(),
    openedBy: pull.user?.login ?? "",
    fingerprint: changeIdOf(compare?.files ?? []),
    reviewer: reviewerFor(routed),
    role: reviewerRoleFor(routed),
  };
}
