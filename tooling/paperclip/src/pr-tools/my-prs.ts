import type { CheckState } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import { everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import { type PullComment, signedApprovals } from "./approvals.ts";
import {
  ciOkOf,
  mergeableOf,
  type PrStatus,
  type PullDetails,
  shownTitle,
  titleText,
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
  /** Left out for a private repository's pull request (`shownTitle`). */
  readonly title?: string;
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

interface ListedPull {
  readonly number: number;
  readonly head: { readonly ref: string; readonly repo: { readonly full_name: string } | null };
}

/**
 * A repository's open pull requests, or undefined for one after the first
 * that the token doesn't reach: GitHub answers 404 for a private repository
 * it can't see (`cloud` before the token covered it, HAL-17730).
 */
async function openPulls(
  get: GitHubGet,
  repo: string,
  first: boolean,
): Promise<ListedPull[] | undefined> {
  try {
    return (await everyPage(get, `/repos/${repo}/pulls?state=open`)) as ListedPull[];
  } catch (error) {
    if (first || !/ answered 404\b/.test((error as Error).message)) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Reads the agent's open pull requests: the lists, then about 3 GitHub
 * requests each. A repository the token doesn't reach goes to `unread`.
 */
export async function myPrs(
  get: GitHubGet,
  repos: readonly string[],
  urlKey: string,
  unread: string[] = [],
): Promise<MyPr[]> {
  const author = urlKey.toLowerCase();
  const found: MyPr[] = [];
  for (const [index, repo] of repos.entries()) {
    const open = await openPulls(get, repo, index === 0);
    if (open === undefined) {
      unread.push(repo);
      continue;
    }
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
        const title = shownTitle(pull);
        return {
          repo,
          number,
          ...(title === undefined ? {} : { title }),
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

/** `#123`, or `cloud#123` when the list spans more than one repository. */
function label(pr: MyPr, oneRepo: boolean): string {
  return oneRepo ? `#${pr.number}` : `${pr.repo.slice(pr.repo.indexOf("/") + 1)}#${pr.number}`;
}

/** One line per pull request, the ones that need the agent first, then the repositories not read. */
export function myPrsText(
  urlKey: string,
  prs: readonly MyPr[],
  unread: readonly string[] = [],
): string {
  const notRead = unread.map((repo) => `Not read: ${repo}, the token doesn't reach it.`);
  if (prs.length === 0) {
    return [`No open pull requests on branches starting with ${urlKey}/.`, ...notRead].join("\n");
  }
  const oneRepo = new Set(prs.map((pr) => pr.repo)).size === 1;
  const sorted = [...prs].sort((a, b) => Number(b.needsYou) - Number(a.needsYou));
  const lines = sorted.map((pr) => {
    const facts = [
      pr.draft ? "draft" : "ready",
      `ci-ok ${pr.ciOk}`,
      `mergeable ${pr.mergeable}`,
      pr.approvedOnHead ? "approved on head" : "not approved on head",
    ].join(", ");
    return `${pr.needsYou ? "NEEDS YOU " : ""}${label(pr, oneRepo)} (${pr.task ?? "no task"}): ${facts}; ${titleText(pr.title)}`;
  });
  const outOfSync = prs.filter((pr) => pr.needsYou).length;
  return [
    `${prs.length} open pull requests, ${outOfSync} out of sync. Titles are ${untrustedNote}.`,
    ...lines,
    "Mergeable unknown means GitHub is still working it out; ask again with pr_status.",
    ...notRead,
  ].join("\n");
}
