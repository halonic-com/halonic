import { type ChangedFile, readManifests } from "../pr-tools/manifests.ts";
import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import { reviewerFor } from "../reviewer-paths.ts";
import { everyPage, type GitHubGet } from "./github.ts";
import type { ReviewerRoute } from "./handoff.ts";

/**
 * The reviewer by the path rules, read the way `pr_status` reads it: the
 * changed files and lines, and each changed package manifest at the merge
 * base and head. About 4 GET requests, and only for a pull request that is
 * ready for review, so a pass stays cheap. Whether it's a security or
 * release pull request the paths can't tell: its author says so on the task
 * (`PR watcher: own review task`), and then the watcher never routes it.
 */
export function gitHubRoute(get: GitHubGet): ReviewerRoute {
  return async ({ repo, number, head }) => {
    const [pull, files] = await Promise.all([
      get(`/repos/${repo}/pulls/${number}`) as Promise<PullDetails>,
      everyPage(get, `/repos/${repo}/pulls/${number}/files`) as Promise<ChangedFile[]>,
    ]);
    const compare = (await get(
      `/repos/${repo}/compare/${branchPath(pull.base.ref)}...${head}`,
    )) as { merge_base_commit?: { sha?: string } };
    const manifests = await readManifests(get, repo, files, {
      base: compare.merge_base_commit?.sha,
      head,
    });
    return reviewerFor({
      files: files.map((file) => file.filename),
      changedLines: (pull.additions ?? 0) + (pull.deletions ?? 0),
      sensitive: false,
      manifests,
    });
  };
}
