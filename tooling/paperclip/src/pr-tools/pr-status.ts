import { branchOwner, type CheckState } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import {
  ciOk,
  draftCiOkName,
  everyPage,
  type GitHubGet,
  inMergeQueue,
  latestReview,
} from "../pr-watcher/github.ts";
import { reviewerFor } from "../reviewer-paths.ts";
import { type Approval, approvals, type PullComment } from "./approvals.ts";

/**
 * The `pr_status` tool: everything an agent asks GitHub when it checks a
 * pull request (is it green, mergeable, approved, queued?) in one read.
 */

/** What `pr_status` returns. */
export interface PrStatus {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state: "open" | "merged" | "closed";
  readonly draft: boolean;
  readonly branch: string;
  readonly author: string | undefined;
  readonly task: string | undefined;
  readonly head: string;
  /** The draft's light-run `ci-ok` while it's a draft. */
  readonly ciOk: CheckState;
  /** `unknown` while GitHub is still working it out. */
  readonly mergeable: "yes" | "conflict" | "unknown";
  /** Commits on the base branch the pull request doesn't have; undefined once it's closed. */
  readonly behindBase: number | undefined;
  readonly inQueue: boolean;
  readonly approvals: readonly Approval[];
  readonly approvedOnHead: boolean;
  /** The reviewer by the path rules (HAL-14809), from the changed files and lines. */
  readonly reviewer: "julian" | "liam";
  readonly changedLines: number;
  /** The newest review finding on the head, as `<id> at <time>`. */
  readonly latestReviewFinding: string | undefined;
}

/** The parts of GitHub's pull request the tools read. */
export interface PullDetails {
  readonly html_url: string;
  readonly title: string;
  readonly state: "open" | "closed";
  readonly draft?: boolean;
  readonly merged_at: string | null;
  readonly mergeable: boolean | null;
  readonly additions?: number;
  readonly deletions?: number;
  readonly head: {
    readonly sha: string;
    readonly ref: string;
    readonly repo?: { readonly full_name: string } | null;
  };
  readonly base: { readonly ref: string };
}

/** `yes`, `conflict`, or `unknown` while GitHub is still working it out. */
export function mergeableOf(pull: PullDetails): PrStatus["mergeable"] {
  if (pull.mergeable === null) {
    return "unknown";
  }
  return pull.mergeable ? "yes" : "conflict";
}

function stateOf(pull: PullDetails): PrStatus["state"] {
  if (pull.merged_at !== null) {
    return "merged";
  }
  return pull.state;
}

/** The `ci-ok` that applies to the pull request: the light run's while it's a draft. */
export function ciOkOf(get: GitHubGet, repo: string, pull: PullDetails): Promise<CheckState> {
  return ciOk(get, repo, pull.head.sha, pull.draft === true ? draftCiOkName : "ci-ok");
}

/** Reads one pull request's whole status: about 10 GitHub requests. */
export async function prStatus(get: GitHubGet, repo: string, number: number): Promise<PrStatus> {
  const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
  const head = pull.head.sha;
  const state = stateOf(pull);
  const open = state === "open";
  const [ciOkOnHead, comments, files, review, inQueue, compare] = await Promise.all([
    ciOkOf(get, repo, pull),
    everyPage(get, `/repos/${repo}/issues/${number}/comments`) as Promise<PullComment[]>,
    everyPage(get, `/repos/${repo}/pulls/${number}/files`) as Promise<{ filename: string }[]>,
    latestReview(get, repo, number, head),
    open ? inMergeQueue(get, repo, number) : Promise.resolve(false),
    open
      ? (get(`/repos/${repo}/compare/${pull.base.ref}...${head}`) as Promise<{
          behind_by?: number;
        }>)
      : Promise.resolve(undefined),
  ]);
  const changedLines = (pull.additions ?? 0) + (pull.deletions ?? 0);
  // A fork's branch can be named like ours, so it names no author or task.
  const ours = pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase();
  const author = ours ? branchOwner(pull.head.ref) : undefined;
  // The author says whether it's a security or release pull request; the paths can't tell.
  const reviewer = reviewerFor({
    files: files.map((file) => file.filename),
    changedLines,
    sensitive: false,
  });
  const found = approvals(comments, { head, author, reviewer });
  return {
    repo,
    number,
    url: pull.html_url,
    title: pull.title,
    state,
    draft: pull.draft === true,
    branch: pull.head.ref,
    author,
    task: ours ? taskOfBranch(pull.head.ref) : undefined,
    head,
    ciOk: ciOkOnHead,
    mergeable: mergeableOf(pull),
    behindBase: compare?.behind_by,
    inQueue,
    approvals: found,
    approvedOnHead: found.some((approval) => approval.counts),
    reviewer,
    changedLines,
    latestReviewFinding: review === undefined ? undefined : `${review.id} at ${review.at}`,
  };
}

/** What the author has to do next, in words. */
function nextSteps(status: PrStatus): string[] {
  if (status.state !== "open") {
    return [];
  }
  const steps: string[] = [];
  if (status.ciOk === "failure") steps.push("fix the red ci-ok");
  if (status.mergeable === "conflict") steps.push("rebase: it conflicts with its base");
  if (status.draft && status.ciOk === "success")
    steps.push("mark it ready: the light run is green");
  if (!status.draft && status.ciOk === "success" && !status.approvedOnHead) {
    steps.push(`get a review on this head (${status.reviewer} by the path rules)`);
  }
  return steps;
}

/** The short text an agent reads: one line per fact, then what needs doing. */
export function statusText(status: PrStatus): string {
  const signed =
    status.approvals.length === 0
      ? "none"
      : status.approvals
          .map(
            (a) =>
              `${a.by} on ${a.head}${a.counts ? "" : " (doesn't count)"}${a.note ? `: ${a.note}` : ""}`,
          )
          .join("; ");
  const steps = nextSteps(status);
  return [
    `#${status.number} ${status.title} (${status.repo})`,
    `${status.state}${status.draft ? ", draft" : ""}; task ${status.task ?? "none"}; author ${status.author ?? "unknown"}`,
    `head ${status.head.slice(0, 7)}: ci-ok ${status.ciOk}; mergeable ${status.mergeable}; behind base by ${status.behindBase ?? "n/a"}`,
    `merge queue: ${status.inQueue ? "queued" : "not queued"}; approvals: ${signed}`,
    `${status.changedLines} changed lines; reviewer by the path rules: ${status.reviewer}`,
    ...(status.latestReviewFinding === undefined
      ? []
      : [`newest review finding on this head: ${status.latestReviewFinding}`]),
    `next: ${steps.length === 0 ? "nothing for the author right now" : steps.join("; ")}`,
  ].join("\n");
}
