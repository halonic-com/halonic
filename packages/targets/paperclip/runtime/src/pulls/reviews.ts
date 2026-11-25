import type { GitHubGet } from "../github.ts";
import { byReviewer, everyPage } from "./reads.ts";

/**
 * What reviewers said on a pull request: signed approvals and the newest
 * finding. Ported from `tooling/paperclip` (`pr-tools/approvals.ts`,
 * `pr-watcher/github.ts`). Which reviewer may approve which paths is a
 * company's own routing, so it stays out of this generic runtime: an
 * approval counts on the current head when the repository's team signed it
 * and it isn't the author's own.
 */

/** A conversation comment, review or inline comment, as the REST API lists it. */
export interface Review {
  readonly id?: number;
  readonly commit_id?: string;
  readonly original_commit_id?: string;
  readonly submitted_at?: string;
  readonly created_at?: string;
  readonly state?: string;
  readonly body?: string | null;
  readonly author_association?: string;
}

/** One signed approval found on the pull request. */
export interface Approval {
  readonly by: string;
  readonly head: string;
  /** The head named in a re-approval's range-diff part. */
  readonly rebaseOf?: string;
  readonly counts: boolean;
  /** Why it doesn't count, or what it holds only under. */
  readonly note?: string;
}

/** One signed approval line, before deciding whether it counts. */
export interface SignedApproval {
  readonly by: string;
  readonly head: string;
  readonly rebaseOf?: string;
}

// "Name: approved on head `abc1234`", or a re-approval after a rebase that names the head it was compared with.
const approvalLine =
  /^[ \t]*(?:\*\*)?([A-Z][a-z]+)(?:\*\*)?:[ \t]*(?:approved on head[ \t]*`?([0-9a-f]{7,40})`?|re-approved on head[ \t]*`?([0-9a-f]{7,40})`?[ \t]*\(rebase only, range-diff vs[ \t]*`?([0-9a-f]{7,40})`?\))/gm;

/**
 * Signed approvals in conversation comments, oldest first. Only comments from
 * the repository's team count: on a public repository anyone can write
 * "Liam: approved on head …".
 */
export function signedApprovals(comments: readonly Review[]): SignedApproval[] {
  return comments.filter(byReviewer).flatMap(({ body }) =>
    [...(body ?? "").matchAll(approvalLine)].flatMap(
      ([, by, approved, reapproved, rebaseOf]): SignedApproval[] => {
        if (by === undefined) {
          return [];
        }
        if (approved !== undefined) {
          return [{ by, head: approved }];
        }
        return reapproved !== undefined && rebaseOf !== undefined
          ? [{ by, head: reapproved, rebaseOf }]
          : [];
      },
    ),
  );
}

/** A pull request's author: the agent whose `urlKey` starts the branch, and its display name when known. */
export interface PullAuthor {
  readonly urlKey: string;
  readonly name?: string | undefined;
}

/**
 * Whether the author signed this approval. A signature names one word, such
 * as "Liam", while a `urlKey` can be `liam-cto`, so the author's display name
 * and its first word count too, ignoring case.
 */
export function signedByAuthor(by: string, author: PullAuthor | undefined): boolean {
  if (author === undefined) {
    return false;
  }
  const name = author.name?.trim().toLowerCase() ?? "";
  const own = [author.urlKey.toLowerCase(), name, name.split(/\s+/)[0] ?? ""];
  return own.filter((word) => word !== "").includes(by.toLowerCase());
}

/** Whether each signed approval counts on the current head of a pull request by `author`. */
export function approvals(
  comments: readonly Review[],
  pull: { readonly head: string; readonly author: PullAuthor | undefined },
): Approval[] {
  return signedApprovals(comments).map((approval): Approval => {
    if (!pull.head.startsWith(approval.head)) {
      return { ...approval, counts: false, note: "names an older head" };
    }
    if (signedByAuthor(approval.by, pull.author)) {
      return { ...approval, counts: false, note: "the author's own pull request" };
    }
    return { ...approval, counts: true };
  });
}

/**
 * A review or conversation comment that asks the author for something: a
 * finding tagged `[blocker]`, `[major]` or `[minor]`, or a verdict "changes
 * requested" at the start of a line or right after a `Name:` lead-in.
 * Approvals, `[nit]`s and "No changes requested" don't count.
 */
export function asksForChanges(body: string): boolean {
  return (
    /^\s*(?:[-*]\s+)?\[(?:blocker|major|minor)\]/im.test(body) ||
    /^[ \t]*(?:[-*>][ \t]+)?(?:[^\n]{0,80}?:[ \t]*)?(?:\*\*|_)?changes requested\b/im.test(body)
  );
}

/** A review finding, as `r<id>`, `c<id>` or `i<id>` with its time. */
export interface Finding {
  readonly id: string;
  readonly at: string;
}

/**
 * The newest review finding from someone who may review: a review on the
 * head that requests changes or asks for them in words, an inline comment on
 * the head, or a conversation comment that asks for changes.
 */
export function newestFinding(
  lists: {
    readonly reviews: readonly Review[];
    readonly inline: readonly Review[];
    readonly conversation: readonly Review[];
  },
  head: string,
): Finding | undefined {
  const { reviews, inline, conversation } = lists;
  const found = [
    ...reviews
      .filter(byReviewer)
      .filter((review) => review.commit_id === head)
      .filter((review) => review.state === "CHANGES_REQUESTED" || asksForChanges(review.body ?? ""))
      .map((review) => ({ id: `r${review.id}`, at: review.submitted_at ?? "" })),
    ...inline
      .filter(byReviewer)
      .filter((comment) => (comment.original_commit_id ?? comment.commit_id) === head)
      .map((comment) => ({ id: `c${comment.id}`, at: comment.created_at ?? "" })),
    ...conversation
      .filter(byReviewer)
      .filter((comment) => asksForChanges(comment.body ?? ""))
      .map((comment) => ({ id: `i${comment.id}`, at: comment.created_at ?? "" })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return found[0];
}

/** Reads the reviews and inline comments and finds the newest finding on `head`. */
export async function latestFinding(
  get: GitHubGet,
  repo: string,
  number: number,
  head: string,
  conversation: readonly Review[],
): Promise<Finding | undefined> {
  const [reviews, inline] = (await Promise.all([
    everyPage(get, `/repos/${repo}/pulls/${number}/reviews`),
    get(`/repos/${repo}/pulls/${number}/comments?sort=created&direction=desc&per_page=100`),
  ])) as [Review[], Review[]];
  return newestFinding({ reviews, inline, conversation }, head);
}
