import type { PullDetails } from "../pr-tools/pr-status.ts";
import { type CompareFile, sameChanges } from "../verdicts/compare.ts";
import { branchPath } from "../verdicts/github-read.ts";
import type { PullFacts } from "./decide.ts";
import type { GitHubGet } from "./github.ts";

export { type CompareFile, changeIdOf, sameChanges } from "../verdicts/compare.ts";

/** Whether only a rebase changed a pull request since the approved head (HAL-17759). */
export type RebaseOnly = (pull: PullFacts, approvedHead: string) => Promise<boolean>;

/**
 * The approximate `git range-diff` the watcher can do read-only: the base
 * branch compared with the approved head and with the current head, each
 * from its merge base, so the pull request's own change on both sides. Equal
 * changes mean only a rebase; a conflict fix, a new commit or a moved
 * context line counts as a real change, so the reviewer of the paths sees
 * it. Three GET requests. A stacked pull request the watcher rebased off a
 * merged base (HAL-18031) was approved against that base, so its approved
 * side is compared from the base's last head, which `stackBase` names.
 */
export function gitHubRebaseOnly(
  get: GitHubGet,
  stackBase: (pull: string, approvedHead: string) => string | undefined = () => undefined,
): RebaseOnly {
  return async ({ repo, number, head }, approvedHead) => {
    const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
    const base = branchPath(pull.base.ref);
    const approvedBase = stackBase(`${repo}#${number}`, approvedHead) ?? base;
    const [before, after] = (await Promise.all([
      get(`/repos/${repo}/compare/${approvedBase}...${approvedHead}`),
      get(`/repos/${repo}/compare/${base}...${head}`),
    ])) as { files?: CompareFile[] }[];
    return sameChanges(before?.files ?? [], after?.files ?? []);
  };
}
