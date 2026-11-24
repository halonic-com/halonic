import {
  branchOwner,
  type Memory,
  marker,
  type PullFacts,
  short,
  type WatchedTask,
} from "./decide.ts";

/**
 * The review handoff (board, HAL-10, 24 Nov; HAL-17675): a task whose pull
 * requests are all out of draft and green goes to its reviewer by itself,
 * and a push after an approval gets one warning. Rules only, no I/O, like
 * `decide.ts`; `watch.ts` carries them out.
 */

/** Who reviews a pull request on `halonic` (HAL-14809). */
export type Reviewer = "julian" | "liam";

/** The reviewer by the path rules (`reviewerFor`), read from GitHub for one pull request. */
export type ReviewerRoute = (pull: PullFacts) => Promise<Reviewer>;

function at(pull: { readonly repo: string; readonly number: number }, head: string): string {
  return `${pull.repo}#${pull.number} ${short(head)}`;
}

/** The approvals by anyone but the pull request's author, oldest first. */
function othersApprovals(pull: PullFacts): readonly { by: string; head: string }[] {
  const author = branchOwner(pull.branch);
  return (pull.approvals ?? []).filter(({ by }) => by.toLowerCase() !== author);
}

/** Someone other than its author signed an approval on its current head. */
export function approvedOnHead(pull: PullFacts): boolean {
  return othersApprovals(pull).some(({ head }) => pull.head.startsWith(head));
}

/** The key of a handoff for this head: one per head, so a new push can go to review again. */
export function readyKey(pull: PullFacts): string {
  return `${at(pull, pull.head)} ready`;
}

/** Nothing on it waits for its author: out of draft, mergeable, no open finding, and green or approved. */
function settled(pull: PullFacts): boolean {
  if (pull.draft || pull.conflicting || pull.retargeted || pull.latestReview !== undefined) {
    return false;
  }
  return approvedOnHead(pull) || pull.inQueue || pull.ciOkOnHead === "success";
}

/**
 * The open pull requests that wait for a reviewer, when the task can go to
 * one: every open pull request is settled, at least one isn't approved on
 * its head, and the watcher hasn't handed this head over before. None when
 * the task has an open child task (a security or release pull request's
 * review task among them) or its author's newest comment says the pull
 * request has a review task of its own.
 */
export function waitingForReview(
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
): PullFacts[] {
  if (task.openChildren || memory.ownReview === true) {
    return [];
  }
  const open = pulls.filter((pull) => pull.state === "open");
  if (open.length === 0 || !open.every(settled)) {
    return [];
  }
  const waiting = open.filter((pull) => !approvedOnHead(pull) && !pull.inQueue);
  return waiting.some((pull) => !memory.reported.has(readyKey(pull))) ? waiting : [];
}

/**
 * The reviewer of the task: Liam when any of its pull requests is his by
 * the path rules. Liam's own pull requests go to Julian, whose approval
 * counts on any path there, and Julian's go to Liam (HAL-14809).
 */
export function reviewerOf(author: string | undefined, byPaths: readonly Reviewer[]): Reviewer {
  if (author === "liam") {
    return "julian";
  }
  if (author === "julian") {
    return "liam";
  }
  return byPaths.includes("liam") ? "liam" : "julian";
}

/** The comment that hands the task to its reviewer. */
export function handoffMessage(pulls: readonly PullFacts[], reviewer: Reviewer): string {
  const name = reviewer === "julian" ? "Julian" : "Liam";
  const lines = pulls.map(
    (pull) =>
      `PR watcher: ready for review: [#${pull.number}](${pull.url}), head \`${short(pull.head)}\`.`,
  );
  return [
    ...lines,
    "",
    `Out of draft with a green \`ci-ok\`, so the task goes to ${name}.`,
    ...pulls.map((pull) => marker(readyKey(pull))),
  ].join("\n");
}

/** A push after an approval, worth one warning. */
export interface PushAfterApproval {
  readonly pull: PullFacts;
  /** The head the newest approval names. */
  readonly approvedHead: string;
  readonly key: string;
}

/**
 * Open pull requests pushed to after an approval: the newest approval names
 * an older head, and none names the current one. Once per approval. Not
 * while it conflicts or is a draft, and not when the watcher reported a
 * conflict or a base change on the approved head, since then the push was
 * the fix the queue needed.
 */
export function pushedAfterApproval(
  pulls: readonly PullFacts[],
  memory: Memory,
): PushAfterApproval[] {
  return pulls.flatMap((pull): PushAfterApproval[] => {
    if (pull.state !== "open" || pull.draft || pull.conflicting || approvedOnHead(pull)) {
      return [];
    }
    const newest = othersApprovals(pull).at(-1);
    if (newest === undefined) {
      return [];
    }
    const approved = at(pull, newest.head);
    const key = `${approved} pushed after approval`;
    const seen = [key, `${approved} conflict`, `${approved} retargeted`];
    return seen.some((each) => memory.reported.has(each))
      ? []
      : [{ pull, approvedHead: newest.head, key }];
  });
}

/** The warning on the task for pushes after an approval. */
export function pushedMessage(pushes: readonly PushAfterApproval[]): string {
  const lines = pushes.map(
    ({ pull, approvedHead }) =>
      `- [#${pull.number}](${pull.url}): approved on \`${short(approvedHead)}\`, now at \`${short(pull.head)}\`.`,
  );
  return [
    "PR watcher: pushed after approval; this voids the approval.",
    "",
    ...lines,
    "",
    "After an approval, push only when the queue session or a check asks for it (a conflict, a red check). The new head needs a new approval.",
    ...pushes.map(({ key }) => marker(key)),
  ].join("\n");
}
