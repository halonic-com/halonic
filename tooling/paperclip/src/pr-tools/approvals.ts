import { byReviewer } from "../pr-watcher/github.ts";

/**
 * Signed approvals on a pull request, by the HAL-14809 rules: a comment
 * "<Name>: approved on head `abc1234`" (7 or more characters) on the current
 * head. Julian's counts only within his limits, or on a pull request Liam
 * wrote; nobody approves their own. After a rebase-only push to a pull request
 * Liam approved, Julian's "re-approved on head `<new>` (rebase only,
 * range-diff vs `<old>`)" counts outside his limits too, when Liam approved
 * `<old>`.
 */

/** The reviewers whose signed approvals count. */
export const reviewers: readonly string[] = ["Liam", "Julian"];

/** One signed approval found on the pull request. */
export interface Approval {
  readonly by: string;
  readonly head: string;
  /** The head Liam approved, when this is a re-approval after a rebase-only push. */
  readonly rebaseOf?: string;
  readonly counts: boolean;
  /** Why it doesn't count, or what still applies when it does. */
  readonly note?: string;
}

// A re-approval counts only with the range-diff part, which names the head it was compared with.
const approvalLine =
  /^[ \t]*(?:\*\*)?([A-Z][a-z]+)(?:\*\*)?:[ \t]*(?:approved on head[ \t]*`?([0-9a-f]{7,40})`?|re-approved on head[ \t]*`?([0-9a-f]{7,40})`?[ \t]*\(rebase only, range-diff vs[ \t]*`?([0-9a-f]{7,40})`?\))/gm;

/** One signed approval line, before deciding whether it counts. */
export interface SignedApproval {
  readonly by: string;
  readonly head: string;
  /** The head named in a re-approval's range-diff part. */
  readonly rebaseOf?: string;
}

/** A conversation comment as GitHub lists it. */
export interface PullComment {
  readonly body?: string | null;
  readonly author_association?: string;
}

/**
 * Signed approvals by our reviewers in conversation comments, oldest first.
 * Only comments from the repository's team count: on a public repository
 * anyone can write "Liam: approved on head …".
 */
export function signedApprovals(comments: readonly PullComment[]): SignedApproval[] {
  return comments.filter(byReviewer).flatMap(({ body }) =>
    [...(body ?? "").matchAll(approvalLine)].flatMap(
      ([, by, approved, reapproved, rebaseOf]): SignedApproval[] => {
        if (by === undefined || !reviewers.includes(by)) {
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

/** What deciding whether an approval counts needs to know about the pull request. */
export interface ApprovedPull {
  readonly head: string;
  /** The agent the branch belongs to, lower case. */
  readonly author: string | undefined;
  /** The reviewer by the path rules, or undefined when the changed files weren't read. */
  readonly reviewer: "julian" | "liam" | undefined;
}

/** Each signed approval, with whether it counts on this pull request's current head. */
export function approvals(comments: readonly PullComment[], pull: ApprovedPull): Approval[] {
  return judgeApprovals(signedApprovals(comments), pull);
}

/** Whether each signed approval, already read, counts on this pull request's current head. */
export function judgeApprovals(
  signed: readonly SignedApproval[],
  pull: ApprovedPull,
): Approval[] {
  return signed.map((approval): Approval => {
    const { by, head } = approval;
    if (!pull.head.startsWith(head)) {
      return { ...approval, counts: false, note: "names an older head" };
    }
    if (by.toLowerCase() === pull.author) {
      return { ...approval, counts: false, note: "the author's own pull request" };
    }
    if (by !== "Julian") {
      return { ...approval, counts: true };
    }
    const anyPaths = pull.author === "liam";
    if (!anyPaths && pull.reviewer === "liam") {
      return rebaseOnly(approval, signed);
    }
    return anyPaths || pull.reviewer === "julian"
      ? { ...approval, counts: true, note: "unless it's a security or release pull request" }
      : {
          ...approval,
          counts: true,
          note: "only within his limits (HAL-14809); pr_status checks",
        };
  });
}

/**
 * Julian's approval outside his limits counts only as a re-approval after a
 * rebase-only push, naming a head Liam approved (HAL-14809).
 */
function rebaseOnly(approval: SignedApproval, signed: readonly SignedApproval[]): Approval {
  const { rebaseOf } = approval;
  if (rebaseOf === undefined) {
    return { ...approval, counts: false, note: "outside Julian's limits (HAL-14809)" };
  }
  const liamApproved = signed.some(
    ({ by, head, rebaseOf: liamRebase }) =>
      by === "Liam" &&
      liamRebase === undefined &&
      (head.startsWith(rebaseOf) || rebaseOf.startsWith(head)),
  );
  return liamApproved
    ? {
        ...approval,
        counts: true,
        note: `rebase only since Liam's approval on ${rebaseOf}; unless it's a security or release pull request`,
      }
    : {
        ...approval,
        counts: false,
        note: `re-approval after a rebase, but Liam didn't approve ${rebaseOf} (HAL-14809)`,
      };
}
