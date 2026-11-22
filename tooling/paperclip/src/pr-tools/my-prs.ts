import type { CheckState } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import { everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import { type PullComment, signedApprovals } from "./approvals.ts";
import {
  ciOkOf,
  mergeableOf,
  type PrStatus,
  type PullDetails,
  untrustedNote,
} from "./pr-status.ts";

/**
 * The `my_prs` tool: the "check your open PRs first" rule (HAL-14785) as one
 * call. Every open pull request whose branch starts with the calling agent's
 * name, and whether each one is in sync (no conflict, `ci-ok` not red).
 */

/** One open pull request, in short. */
export interface MyPr {
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly task: string | undefined;
  readonly draft: boolean;
  readonly head: string;
  readonly ciOk: CheckState;
  readonly mergeable: PrStatus["mergeable"];
  /** Someone other than the author signed an approval on the current head. */
  readonly approvedOnHead: boolean;
  /** Out of sync: it conflicts or its `ci-ok` is red. */
  readonly needsYou: boolean;
}

/** Reads the agent's open pull requests: the lists, then about 3 GitHub requests each. */
export async function myPrs(
  get: GitHubGet,
  repos: readonly string[],
  urlKey: string,
): Promise<MyPr[]> {
  const author = urlKey.toLowerCase();
  const found: MyPr[] = [];
  for (const repo of repos) {
    const open = (await everyPage(get, `/repos/${repo}/pulls?state=open`)) as {
      number: number;
      head: { ref: string; repo: { full_name: string } | null };
    }[];
    // A fork's branch can be named like ours; only branches in the repository count.
    const mine = open.filter(
      (pull) =>
        pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase() &&
        pull.head.ref.toLowerCase().startsWith(`${author}/`),
    );
    const rows = await Promise.all(
      mine.map(async ({ number }): Promise<MyPr> => {
        // The list leaves out `mergeable`; only the pull request itself has it.
        const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
        const [ciOk, comments] = await Promise.all([
          ciOkOf(get, repo, pull),
          everyPage(get, `/repos/${repo}/issues/${number}/comments`) as Promise<PullComment[]>,
        ]);
        const mergeable = mergeableOf(pull);
        return {
          repo,
          number,
          title: pull.title,
          url: pull.html_url,
          task: taskOfBranch(pull.head.ref),
          draft: pull.draft === true,
          head: pull.head.sha,
          ciOk,
          mergeable,
          approvedOnHead: signedApprovals(comments).some(
            ({ by, head }) => pull.head.sha.startsWith(head) && by.toLowerCase() !== author,
          ),
          needsYou: ciOk === "failure" || mergeable === "conflict",
        };
      }),
    );
    found.push(...rows);
  }
  return found;
}

/** One line per pull request, the ones that need the agent first. */
export function myPrsText(urlKey: string, prs: readonly MyPr[]): string {
  if (prs.length === 0) {
    return `No open pull requests on branches starting with ${urlKey}/.`;
  }
  const sorted = [...prs].sort((a, b) => Number(b.needsYou) - Number(a.needsYou));
  const lines = sorted.map((pr) => {
    const facts = [
      pr.draft ? "draft" : "ready",
      `ci-ok ${pr.ciOk}`,
      `mergeable ${pr.mergeable}`,
      pr.approvedOnHead ? "approved on head" : "not approved on head",
    ].join(", ");
    return `${pr.needsYou ? "NEEDS YOU " : ""}#${pr.number} (${pr.task ?? "no task"}): ${facts}; title ${JSON.stringify(pr.title ?? "")}`;
  });
  const outOfSync = prs.filter((pr) => pr.needsYou).length;
  return [
    `${prs.length} open pull requests, ${outOfSync} out of sync. Titles are ${untrustedNote}.`,
    ...lines,
    "Mergeable unknown means GitHub is still working it out; ask again with pr_status.",
  ].join("\n");
}
