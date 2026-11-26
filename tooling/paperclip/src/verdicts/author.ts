import type { CopyAgent } from "../pr-tools/approval-copy.ts";
import { branchAgentOf } from "./branch.ts";

/**
 * Who wrote a pull request, as `review_verdict` works it out (HAL-19481,
 * Liam's change 1 on HAL-19325). Every agent pushes as the same GitHub
 * account, so the branch prefix alone never decides: the agent it names
 * must also have named the pull request in a comment of its own on the task,
 * as authors do when they hand a pull request over. Paperclip records which
 * agent wrote each comment; the receipts it posts in an agent's name don't
 * count. A pull request another GitHub account opened (a bot, an outside
 * contributor) has that account as its author.
 */

/** A task comment, as the author check reads it. */
export interface AuthorComment {
  readonly authorAgentId: string | null;
  /** `comment` for a comment the agent wrote; `fast_response` and any other origin don't count. */
  readonly origin?: string | null | undefined;
  readonly body: string;
}

/** What the author check reads about the pull request and its task. */
export interface AuthorFacts {
  readonly repo: string;
  readonly pr: number;
  readonly branch: string;
  /** The branch lives in the repository itself, not in a fork. */
  readonly ownBranch: boolean;
  /** The GitHub account that opened the pull request. */
  readonly openedBy: string;
  /** The account every agent pushes as (`halonic-dev`). */
  readonly teamLogin: string;
  readonly agents: readonly CopyAgent[];
  /** The comments on the pull request's task (and on the branch's task, when that is another). */
  readonly comments: readonly AuthorComment[];
}

/** The author in lower case (an agent's url key, or another account's login), or why there is none. */
export type AuthorOf = { readonly author: string } | { readonly refusal: string };

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a text names the pull request: its URL, `owner/name#<n>`,
 * `name#<n>` or `#<n>`, with no digit after the number.
 */
export function namesPull(text: string, repo: string, pr: number): boolean {
  const [owner = "", name = ""] = repo.split("/");
  const url = `github\\.com/${escaped(owner)}/${escaped(name)}/pull/${pr}`;
  const short = `(?:^|[^\\w/#.-])(?:(?:${escaped(owner)}/)?${escaped(name)})?#${pr}`;
  return new RegExp(`(?:${url}|${short})(?!\\d)`, "i").test(text);
}

/** The pull request's author, or why `review_verdict` can't tell. */
export function authorOf(facts: AuthorFacts): AuthorOf {
  if (facts.openedBy === "") {
    return { refusal: "GitHub didn't say who opened it" };
  }
  if (facts.openedBy.toLowerCase() !== facts.teamLogin.toLowerCase()) {
    return { author: facts.openedBy.toLowerCase() };
  }
  const owner = facts.ownBranch ? branchAgentOf(facts.branch) : undefined;
  if (owner === undefined) {
    return { refusal: "its branch isn't an agent's branch (<agent>/HAL-<n>-…) in the repository" };
  }
  const agent = facts.agents.find(({ urlKey }) => urlKey === owner);
  if (agent === undefined) {
    return { refusal: `its branch names ${owner}, who isn't one of the company's agents` };
  }
  const named = facts.comments.some(
    (comment) =>
      comment.authorAgentId === agent.id &&
      comment.origin === "comment" &&
      namesPull(comment.body, facts.repo, facts.pr),
  );
  if (!named) {
    const [, name] = facts.repo.split("/");
    return {
      refusal: `${owner}, whom the branch names, hasn't named ${name}#${facts.pr} on the task in a comment of their own`,
    };
  }
  return { author: owner };
}
