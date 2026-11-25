import type { CheckState, GitHubGet } from "../github.ts";
import type { ActionHandler } from "../handlers.ts";
import {
  branchOwner,
  branchPath,
  ciOkOf,
  everyPage,
  fromRepo,
  inMergeQueue,
  type Mergeable,
  mergeableOf,
  type PullDetails,
  repositoriesOf,
  shownTitle,
  taskOfBranch,
  titleText,
  untrustedNote,
} from "./reads.ts";
import { type Approval, approvals, latestFinding, type Review } from "./reviews.ts";

/**
 * The `github.pull-request` action: everything an agent asks GitHub when it
 * checks a pull request (is it green, mergeable, approved, queued?) in one
 * read. Ported from `tooling/paperclip`'s `pr_status`, without its company
 * reviewer routing (see `reviews.ts`).
 */

/** What the action returns as `data`. */
export interface PullRequestStatus {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  /** Left out for a private repository's pull request (`shownTitle`). */
  readonly title?: string;
  readonly state: "open" | "merged" | "closed";
  readonly draft: boolean;
  readonly branch: string;
  readonly author: string | undefined;
  readonly task: string | undefined;
  readonly head: string;
  /** The draft's light-run `ci-ok` while it's a draft. */
  readonly ciOk: CheckState;
  readonly mergeable: Mergeable;
  /** Commits on the base branch the pull request doesn't have; undefined once it's closed. */
  readonly behindBase: number | undefined;
  readonly inQueue: boolean;
  readonly approvals: readonly Approval[];
  readonly approvedOnHead: boolean;
  readonly changedLines: number;
  /** The newest review finding on the head, as `<id> at <time>`. */
  readonly latestReviewFinding: string | undefined;
}

/** `pr` as a number or a pull request URL on one of the tool's repositories. */
export function readPrParams(
  params: unknown,
  repos: readonly string[],
): { repo: string; number: number } | string {
  const { pr, repo } = (params ?? {}) as { pr?: unknown; repo?: unknown };
  const url =
    typeof pr === "string"
      ? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?$/.exec(pr)
      : null;
  const number = Number(url?.[2] ?? pr);
  const chosen = url?.[1] ?? (typeof repo === "string" && repo !== "" ? repo : repos[0]);
  if (!Number.isInteger(number) || number <= 0) {
    return "pr must be a pull request number or its GitHub URL.";
  }
  if (chosen === undefined || !repos.includes(chosen)) {
    return `repo must be one of: ${repos.join(", ")}.`;
  }
  return { repo: chosen, number };
}

/** Reads one pull request's whole status: about 9 GitHub requests. */
export async function pullRequestStatus(
  get: GitHubGet,
  repo: string,
  number: number,
): Promise<PullRequestStatus> {
  const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
  const head = pull.head.sha;
  const state = pull.merged_at !== null ? "merged" : pull.state;
  const open = state === "open";
  const [ciOk, comments, inQueue, compare] = await Promise.all([
    ciOkOf(get, repo, pull),
    everyPage(get, `/repos/${repo}/issues/${number}/comments`) as Promise<Review[]>,
    open ? inMergeQueue(get, repo, number) : Promise.resolve(false),
    open
      ? (get(`/repos/${repo}/compare/${branchPath(pull.base.ref)}...${head}`) as Promise<{
          behind_by?: number;
        }>)
      : Promise.resolve(undefined),
  ]);
  const finding = await latestFinding(get, repo, number, head, comments);
  // A fork's branch can be named like ours, so it names no author or task.
  const ours = fromRepo(pull, repo);
  const author = ours ? branchOwner(pull.head.ref) : undefined;
  const found = approvals(comments, { head, author });
  const title = shownTitle(pull);
  return {
    repo,
    number,
    url: pull.html_url,
    ...(title === undefined ? {} : { title }),
    state,
    draft: pull.draft === true,
    branch: pull.head.ref,
    author,
    task: ours ? taskOfBranch(pull.head.ref) : undefined,
    head,
    ciOk,
    mergeable: mergeableOf(pull),
    behindBase: compare?.behind_by,
    inQueue,
    approvals: found,
    approvedOnHead: found.some((approval) => approval.counts),
    changedLines: (pull.additions ?? 0) + (pull.deletions ?? 0),
    latestReviewFinding: finding === undefined ? undefined : `${finding.id} at ${finding.at}`,
  };
}

/** What the author has to do next, in words. */
function nextSteps(status: PullRequestStatus): string[] {
  if (status.state !== "open") {
    return [];
  }
  const steps: string[] = [];
  if (status.ciOk === "failure") steps.push("fix the red ci-ok");
  if (status.mergeable === "conflict") steps.push("rebase: it conflicts with its base");
  if (status.draft && status.ciOk === "success")
    steps.push("mark it ready: the light run is green");
  if (!status.draft && status.ciOk === "success" && !status.approvedOnHead) {
    steps.push("get a review on this head");
  }
  return steps;
}

function approvalsText(found: readonly Approval[]): string {
  if (found.length === 0) {
    return "none";
  }
  return found
    .map(
      (a) =>
        `${a.by} on ${a.head}${a.counts ? "" : " (doesn't count)"}${a.note ? `: ${a.note}` : ""}`,
    )
    .join("; ");
}

/**
 * The short text an agent reads: one line per fact, then what needs doing.
 * The title and branch come from whoever opened the pull request, a stranger
 * on a fork included, so they stay JSON-quoted in fields of their own.
 */
export function pullRequestText(status: PullRequestStatus): string {
  const steps = nextSteps(status);
  return [
    `#${status.number} (${status.repo})`,
    `${untrustedNote}; ${titleText(status.title)}; branch ${JSON.stringify(status.branch)}`,
    `${status.state}${status.draft ? ", draft" : ""}; task ${status.task ?? "none"}; author ${status.author ?? "unknown"}`,
    `head ${status.head.slice(0, 7)}: ci-ok ${status.ciOk}; mergeable ${status.mergeable}; behind base by ${status.behindBase ?? "n/a"}`,
    `merge queue: ${status.inQueue ? "queued" : "not queued"}; approvals: ${approvalsText(status.approvals)}`,
    `${status.changedLines} changed lines`,
    ...(status.latestReviewFinding === undefined
      ? []
      : [`newest review finding on this head: ${status.latestReviewFinding}`]),
    `next: ${steps.length === 0 ? "nothing for the author right now" : steps.join("; ")}`,
  ].join("\n");
}

/** Reads the pull request the agent names, on one of the tool's repositories. */
export const pullRequestHandler: ActionHandler = {
  capabilities: [],
  run: async ({ tool, params, github }) => {
    if (tool.action.run !== "github.pull-request") {
      return { error: `${tool.name}: runs ${tool.action.run}, not github.pull-request.` };
    }
    const target = readPrParams(params, repositoriesOf(tool));
    if (typeof target === "string") {
      return { error: `${tool.name}: ${target}` };
    }
    const status = await pullRequestStatus(await github(), target.repo, target.number);
    return { content: pullRequestText(status), data: status };
  },
};
