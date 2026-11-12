import type { DecisionNote } from "./decision-notes.ts";
import { approvedAt, type GithubApprover, type ReviewSource, userReviewers } from "./reviews.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  type GitObjects,
  hasSignatureLine,
  parseApprovers,
  signedText,
  splitSignature,
  verifySigned,
} from "./signatures.ts";

/** What the guard asks about a decision note's approval. */
export interface ApprovalRequest {
  /** The note, parsed from the pull request's checkout. */
  readonly note: DecisionNote;
}

/** Whether the approval is real, approved by the right person and for this pull request. */
export type ApprovalVerdict =
  | { readonly approved: true }
  | { readonly approved: false; readonly reason: string };

/**
 * Checks a decision note's approval (plan 9.3). The guard asks this, so
 * an agent can't write its own approval into a note.
 */
export interface ApprovalLookup {
  check(request: ApprovalRequest): Promise<ApprovalVerdict>;
}

/** The pull request a guard run checks, as CI's event names it. */
export interface PullRequest {
  /** `owner/name` of the repo it merges into. */
  readonly repo: string;
  readonly number: number;
  /** The pull request's head commit. */
  readonly head: string;
  /** The base branch's commit it merges into: approvers come from here. */
  readonly base: string;
}

const notApproved = (reason: string): ApprovalVerdict => ({ approved: false, reason });

/**
 * Verifies a note's approval (HAL-1337). A signature is checked offline
 * against the keys the pull request's base pins in `approvers.json` for
 * the note's kind. A `user-visible` note with no signature line is
 * approved instead by an approving review from a GitHub account pinned in
 * this guard's code (`userReviewers`, run from the base branch), made on
 * the pull request's current head commit and read live through `reviews`. It FAILS CLOSED: without the pull request's
 * details, without its commits, with a note the base already has, with a
 * missing, malformed or non-matching signature, or when the reviews can't
 * be read, the note is not approved.
 */
export function signedApprovals(
  pull: PullRequest | undefined,
  git: GitObjects,
  reviews?: ReviewSource,
  reviewers: readonly GithubApprover[] = userReviewers,
): ApprovalLookup {
  return {
    check: async ({ note }) => {
      try {
        return await verifyNote(note, pull, git, reviews, reviewers);
      } catch (error) {
        return notApproved(`the approval lookup failed: ${String(error)}`);
      }
    },
  };
}

async function verifyNote(
  note: DecisionNote,
  pull: PullRequest | undefined,
  git: GitObjects,
  reviews: ReviewSource | undefined,
  reviewers: readonly GithubApprover[],
): Promise<ApprovalVerdict> {
  if (pull === undefined) {
    return notApproved(
      "the guard wasn't given the pull request's repo, number, head and base, so it can't check a signature",
    );
  }
  if (!git.hasCommit(pull.head) || !git.hasCommit(pull.base)) {
    return notApproved("the guard can't read the pull request's head or base commit");
  }
  if (git.objectId(pull.base, note.file) !== undefined) {
    return notApproved(
      `${note.file} is already on the base branch; give this branch a new name and its own note`,
    );
  }
  const approvers = git.readFile(pull.base, approversFile);
  if (approvers === undefined) {
    return notApproved(`the base branch has no ${approversFile}`);
  }
  const text = git.readFile(pull.head, note.file);
  if (text === undefined) {
    return notApproved(`the pull request's head commit has no ${note.file}`);
  }
  let pinned: ReturnType<typeof parseApprovers>;
  try {
    pinned = parseApprovers(approvers);
  } catch (error) {
    return notApproved(`the base branch's ${approversFile} can't be read: ${String(error)}`);
  }
  if (note.kind === "user-visible" && !hasSignatureLine(text)) {
    return reviewApproval(pull, reviewers, reviews);
  }
  const split = splitSignature(text);
  if (!split.ok) {
    return notApproved(split.reason);
  }
  const signed = noteSignedText(note, split.unsigned, pull, git);
  const verdict = verifySigned(signed, split.keyId, split.signature, note.kind, pinned);
  return verdict.ok ? { approved: true } : notApproved(verdict.reason);
}

/** A `user-visible` note is approved by a pinned account's approving review of the head commit. */
async function reviewApproval(
  pull: PullRequest,
  approvers: readonly GithubApprover[],
  reviews: ReviewSource | undefined,
): Promise<ApprovalVerdict> {
  if (approvers.length === 0) {
    return notApproved(
      `the note has no signature line, and the guard pins no GitHub account that can approve a user-visible note`,
    );
  }
  if (reviews === undefined) {
    return notApproved("the guard has no way to read the pull request's reviews on GitHub");
  }
  const approver = approvedAt(await reviews(pull.repo, pull.number), approvers, pull.head);
  return approver === undefined
    ? notApproved(
        `${approvers.map((each) => `@${each.login}`).join(" or ")} hasn't approved the pull request's latest commit ${pull.head.slice(0, 7)} on GitHub; an approval of an older commit doesn't count, and a push replaces it`,
      )
    : { approved: true };
}

/** The text a signature on `note` must sign for this pull request (see {@link signedText}). */
export function noteSignedText(
  note: DecisionNote,
  unsigned: string,
  pull: PullRequest,
  git: GitObjects,
): string {
  const paths = coveredPaths(note.covers, git, pull.head, pull.base);
  return signedText({
    repo: pull.repo,
    pr: pull.number,
    kind: note.kind,
    unsigned,
    objects: coveredObjects(paths, git, pull.head),
  });
}
