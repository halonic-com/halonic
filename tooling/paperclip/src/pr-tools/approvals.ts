import { byReviewer } from "../pr-watcher/github.ts";
import type { ReviewRole } from "../reviewer-paths.ts";
import type { CopyState } from "./approval-copy.ts";

/**
 * Signed approvals on a pull request, by the HAL-14809 rules: a comment
 * "<Name>: approved on head `abc1234`" (7 or more characters) on the current
 * head, or the same with "re-approved" or "approved again", as the Merger reads
 * them (HAL-15553). Julian's counts only within his limits, or on a pull
 * request Liam wrote; nobody approves their own. Julian's "re-approved on
 * head `<new>` (rebase only, range-diff vs `<old>`)" also counts outside his
 * limits when Liam approved `<old>` and `julianRebaseRefusal` allows it, as
 * in the Merger's gate (`merge-control/approval.ts`, HAL-18459). Nora's
 * counts only where the routine reviewer may approve alone (HAL-19248).
 */

/** The reviewers whose signed approvals count. */
export const reviewers: readonly string[] = ["Liam", "Julian", "Nora"];

/** One signed approval found on the pull request. */
export interface Approval {
  readonly by: string;
  readonly head: string;
  /** The head Liam approved, when this is a re-approval after a rebase-only push. */
  readonly rebaseOf?: string;
  readonly counts: boolean;
  /** Why it doesn't count, or what still applies when it does. */
  readonly note?: string;
  /**
   * Whether its Paperclip copy exists (`approval-copy.ts`, HAL-19324); left out
   * when the copies weren't read. Detection only: it never changes `counts`.
   */
  readonly copy?: CopyState;
}

// The same forms as the Merger's gate (`LIAM_RE`, `JULIAN_RE`). The optional range-diff part names
// the head Liam approved, which the note on an uncounted re-approval mentions.
const approvalLine =
  /^[ \t]*(?:\*\*)?([A-Z][a-z]+)(?:\*\*)?:[ \t]*(?:re-)?approved(?: again)? on head[ \t]*`?([0-9a-f]{7,40})`?(?:[ \t]*\(rebase only, range-diff vs[ \t]*`?([0-9a-f]{7,40})`?\))?/gm;

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
  return comments.filter(byReviewer).flatMap(({ body }) => signedLines(body ?? ""));
}

/** The signed approval lines by our reviewers in one text, whoever wrote it. */
export function signedLines(text: string): SignedApproval[] {
  return [...text.matchAll(approvalLine)].flatMap(([, by, head, rebaseOf]): SignedApproval[] => {
    if (by === undefined || head === undefined || !reviewers.includes(by)) {
      return [];
    }
    return rebaseOf === undefined ? [{ by, head }] : [{ by, head, rebaseOf }];
  });
}

/** What deciding whether an approval counts needs to know about the pull request. */
export interface ApprovedPull {
  readonly head: string;
  /** The agent the branch belongs to, lower case. */
  readonly author: string | undefined;
  /**
   * The reviewer by the path rules (`reviewerFor`, the same rule the Merger's
   * `outsideJulianScope` applies), or undefined when the changed files weren't read.
   */
  readonly reviewer: "julian" | "liam" | undefined;
  /**
   * The role by the path rules (`reviewerRoleFor`, which the Merger's
   * `outsideNoraScope` applies too), or undefined when the changed files weren't read.
   */
  readonly role?: ReviewRole;
  /**
   * Why Julian's rebase-only re-approval can't count here
   * (`julianRebaseRefusal`), null when it can, or undefined when the changed
   * files weren't read.
   */
  readonly rebaseRefusal?: string | null;
}

/** Each signed approval, with whether it counts on this pull request's current head. */
export function approvals(comments: readonly PullComment[], pull: ApprovedPull): Approval[] {
  return judgeApprovals(signedApprovals(comments), pull);
}

/** Whether each signed approval, already read, counts on this pull request's current head. */
export function judgeApprovals(signed: readonly SignedApproval[], pull: ApprovedPull): Approval[] {
  return signed.map((approval): Approval => {
    const { by, head } = approval;
    if (!pull.head.startsWith(head)) {
      return { ...approval, counts: false, note: "names an older head" };
    }
    if (by.toLowerCase() === pull.author) {
      return { ...approval, counts: false, note: "the author's own pull request" };
    }
    if (by === "Nora") {
      return noraApproval(approval, pull.role);
    }
    if (by !== "Julian") {
      return { ...approval, counts: true };
    }
    const anyPaths = pull.author === "liam";
    if (!anyPaths && pull.reviewer === "liam") {
      return outsideLimits(approval, signed, pull.rebaseRefusal);
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
 * Nora's counts only where the routine reviewer may approve alone
 * (`routineRefusal`, HAL-19246), without Julian's exceptions: no pull
 * request Liam wrote on any path, no rebase-only re-approval outside them
 * (HAL-19248).
 */
function noraApproval(approval: SignedApproval, role: ApprovedPull["role"]): Approval {
  if (role !== undefined && role !== "routine-reviewer") {
    return { ...approval, counts: false, note: "outside Nora's limits (the routine reviewer's)" };
  }
  return role === "routine-reviewer"
    ? { ...approval, counts: true, note: "unless it's a security or release pull request" }
    : { ...approval, counts: true, note: "only within her limits (HAL-19248); pr_status checks" };
}

/**
 * Julian's approval outside his limits counts only as a re-approval after a
 * rebase-only push of a head Liam approved, on a pull request
 * `julianRebaseRefusal` allows (HAL-18459).
 */
function outsideLimits(
  approval: SignedApproval,
  signed: readonly SignedApproval[],
  refusal: string | null | undefined,
): Approval {
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
  if (!liamApproved) {
    return {
      ...approval,
      counts: false,
      note: `re-approval after a rebase, and Liam didn't approve ${rebaseOf}`,
    };
  }
  const since = `rebase only since Liam's approval on ${rebaseOf}`;
  if (refusal === null) {
    return { ...approval, counts: true, note: `${since} (HAL-18459)` };
  }
  const why = refusal ?? "the changed files weren't read";
  return { ...approval, counts: false, note: `${since}, but ${why}: needs Liam` };
}
