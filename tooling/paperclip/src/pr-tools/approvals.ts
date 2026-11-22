import { byReviewer } from "../pr-watcher/github.ts";

/**
 * Signed approvals on a pull request, by the HAL-14809 rules: a comment
 * "<Name>: approved on head `abc1234`" (7 or more characters) on the current
 * head. Julian's counts only within his limits, or on a pull request Liam
 * wrote; nobody approves their own.
 */

/** The reviewers whose signed approvals count. */
export const reviewers: readonly string[] = ["Liam", "Julian"];

/** One signed approval found on the pull request. */
export interface Approval {
  readonly by: string;
  readonly head: string;
  readonly counts: boolean;
  /** Why it doesn't count, or what still applies when it does. */
  readonly note?: string;
}

const approvalLine =
  /^[ \t]*(?:\*\*)?([A-Z][a-z]+)(?:\*\*)?:[ \t]*approved on head[ \t]*`?([0-9a-f]{7,40})`?/gm;

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
export function signedApprovals(comments: readonly PullComment[]): { by: string; head: string }[] {
  return comments
    .filter(byReviewer)
    .flatMap(({ body }) =>
      [...(body ?? "").matchAll(approvalLine)].flatMap(([, by, head]) =>
        by !== undefined && head !== undefined && reviewers.includes(by) ? [{ by, head }] : [],
      ),
    );
}

/** What deciding whether an approval counts needs to know about the pull request. */
export interface ApprovedPull {
  readonly head: string;
  /** The agent the branch belongs to, lower case. */
  readonly author: string | undefined;
  /** The reviewer by the path rules. */
  readonly reviewer: "julian" | "liam";
}

/** Each signed approval, with whether it counts on this pull request's current head. */
export function approvals(comments: readonly PullComment[], pull: ApprovedPull): Approval[] {
  return signedApprovals(comments).map(({ by, head }): Approval => {
    if (!pull.head.startsWith(head)) {
      return { by, head, counts: false, note: "names an older head" };
    }
    if (by.toLowerCase() === pull.author) {
      return { by, head, counts: false, note: "the author's own pull request" };
    }
    if (by === "Julian" && pull.author !== "liam" && pull.reviewer !== "julian") {
      return { by, head, counts: false, note: "outside Julian's limits (HAL-14809)" };
    }
    return by === "Julian"
      ? { by, head, counts: true, note: "unless it's a security or release pull request" }
      : { by, head, counts: true };
  });
}
