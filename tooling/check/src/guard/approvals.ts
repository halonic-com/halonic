import type { DecisionNote } from "./decision-notes.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  type GitObjects,
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
 * Verifies a note's signature offline (HAL-1337) against the keys the
 * pull request's base pins in `approvers.json` for the note's kind. It
 * FAILS CLOSED: without the pull request's details, without its commits,
 * with a note the base already has, or with a missing, malformed or
 * non-matching signature, the note is not approved.
 */
export function signedApprovals(pull: PullRequest | undefined, git: GitObjects): ApprovalLookup {
  return {
    check: ({ note }) => Promise.resolve(verifyNote(note, pull, git)),
  };
}

function verifyNote(
  note: DecisionNote,
  pull: PullRequest | undefined,
  git: GitObjects,
): ApprovalVerdict {
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
  const split = splitSignature(text);
  if (!split.ok) {
    return notApproved(split.reason);
  }
  let pinned: ReturnType<typeof parseApprovers>;
  try {
    pinned = parseApprovers(approvers);
  } catch (error) {
    return notApproved(`the base branch's ${approversFile} can't be read: ${String(error)}`);
  }
  const signed = noteSignedText(note, split.unsigned, pull, git);
  const verdict = verifySigned(signed, split.keyId, split.signature, note.kind, pinned);
  return verdict.ok ? { approved: true } : notApproved(verdict.reason);
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
