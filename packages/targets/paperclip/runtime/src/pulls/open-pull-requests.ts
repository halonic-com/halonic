import type { CheckState, GitHubGet } from "../github.ts";
import type { ActionHandler } from "../handlers.ts";
import {
  ciOkOf,
  everyPage,
  type Mergeable,
  mergeableOf,
  type PullDetails,
  readUnlessHidden,
  repositoriesOf,
  shownTitle,
  taskOfBranch,
  titleText,
  untrustedNote,
} from "./reads.ts";
import { type PullAuthor, type Review, signedApprovals, signedByAuthor } from "./reviews.ts";

/**
 * The `github.open-pull-requests` action: every open pull request whose
 * branch starts with the calling agent's name, and whether each one is in
 * sync (no conflict, `ci-ok` not red). Ported from `tooling/paperclip`'s
 * `my_prs`.
 */

/** One open pull request, in short. */
export interface OpenPullRequest {
  readonly repo: string;
  readonly number: number;
  /** Left out for a private repository's pull request (`shownTitle`). */
  readonly title?: string;
  readonly url: string;
  readonly task: string | undefined;
  readonly draft: boolean;
  readonly head: string;
  readonly ciOk: CheckState;
  readonly mergeable: Mergeable;
  /** Someone other than the author signed an approval on the current head. */
  readonly approvedOnHead: boolean;
  /** Out of sync: it conflicts or its `ci-ok` is red. */
  readonly needsYou: boolean;
}

interface ListedPull {
  readonly number: number;
  readonly head: { readonly ref: string; readonly repo: { readonly full_name: string } | null };
}

/** One of the agent's pull requests: about 3 GitHub requests. */
async function openPullRequest(
  get: GitHubGet,
  repo: string,
  number: number,
  author: PullAuthor,
): Promise<OpenPullRequest> {
  // The list leaves out `mergeable`; only the pull request itself has it.
  const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
  const [ciOk, comments] = await Promise.all([
    ciOkOf(get, repo, pull),
    everyPage(get, `/repos/${repo}/issues/${number}/comments`) as Promise<Review[]>,
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
      ({ by, head }) => pull.head.sha.startsWith(head) && !signedByAuthor(by, author),
    ),
    needsYou: ciOk === "failure" || mergeable === "conflict",
  };
}

/** The agent's open pull requests on `repos`. A repository the token doesn't reach goes to `unread`. */
export async function openPullRequests(
  get: GitHubGet,
  repos: readonly string[],
  agent: PullAuthor,
  unread: string[] = [],
): Promise<OpenPullRequest[]> {
  const author = agent.urlKey.toLowerCase();
  const found: OpenPullRequest[] = [];
  for (const [index, repo] of repos.entries()) {
    const open = await readUnlessHidden(
      () => everyPage(get, `/repos/${repo}/pulls?state=open`) as Promise<ListedPull[]>,
      index === 0,
    );
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
    found.push(
      ...(await Promise.all(mine.map(({ number }) => openPullRequest(get, repo, number, agent)))),
    );
  }
  return found;
}

/** `#123`, or `cloud#123` when the list spans more than one repository. */
function label(pr: OpenPullRequest, oneRepo: boolean): string {
  return oneRepo ? `#${pr.number}` : `${pr.repo.slice(pr.repo.indexOf("/") + 1)}#${pr.number}`;
}

/** One line per pull request, the ones that need the agent first, then the repositories not read. */
export function openPullRequestsText(
  urlKey: string,
  prs: readonly OpenPullRequest[],
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
    // The workspace names its tools, so this line names none.
    "Mergeable unknown means GitHub is still working it out; ask again for that pull request.",
    ...notRead,
  ].join("\n");
}

/** Lists the calling agent's open pull requests on the tool's repositories. */
export const openPullRequestsHandler: ActionHandler = {
  capabilities: [],
  run: async ({ tool, caller, github }) => {
    if (tool.action.run !== "github.open-pull-requests") {
      return { error: `${tool.name}: runs ${tool.action.run}, not github.open-pull-requests.` };
    }
    const unread: string[] = [];
    const repos = repositoriesOf(tool);
    const prs = await openPullRequests(await github(), repos, caller, unread);
    return { content: openPullRequestsText(caller.urlKey, prs, unread), data: prs };
  },
};
