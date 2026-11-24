import { judgeApprovals } from "../pr-tools/approvals.ts";
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
 * and so does one whose only approval on its head is Julian's outside his
 * limits (HAL-17680), and a push after an approval gets one warning. Rules only, no I/O, like
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

/** Pull requests by `owner/name#123`, as `refused` names them. */
export function pullId(pull: { readonly repo: string; readonly number: number }): string {
  return `${pull.repo}#${pull.number}`;
}

/** Pull requests whose approvals on the head don't count (Julian outside his limits). */
export type Refused = ReadonlySet<string>;

const none: Refused = new Set();

/**
 * Someone other than its author signed an approval on its current head, and
 * it isn't one whose approval was found not to count.
 */
export function approvedOnHead(pull: PullFacts, refused: Refused = none): boolean {
  return (
    !refused.has(pullId(pull)) &&
    othersApprovals(pull).some(({ head }) => pull.head.startsWith(head))
  );
}

/** The key of a handoff for this head: one per head, so a new push can go to review again. */
export function readyKey(pull: PullFacts): string {
  return `${at(pull, pull.head)} ready`;
}

/** The key of a handoff to Liam after Julian's approval on this head didn't count: once per head. */
export function outsideKey(pull: PullFacts): string {
  return `${at(pull, pull.head)} outside julian`;
}

function handoffKey(pull: PullFacts, refused: Refused): string {
  return refused.has(pullId(pull)) ? outsideKey(pull) : readyKey(pull);
}

/**
 * Its only approvals on the head are Julian's, on a pull request neither
 * Liam nor Julian wrote: whether they count depends on its paths, so the
 * watcher reads them (`julianRefused`) unless it already handed this head to
 * Liam.
 */
export function julianOnlyOnHead(pull: PullFacts, memory: Memory): boolean {
  const author = branchOwner(pull.branch);
  if (pull.state !== "open" || pull.inQueue || author === "liam" || author === "julian") {
    return false;
  }
  const onHead = othersApprovals(pull).filter(({ head }) => pull.head.startsWith(head));
  return (
    onHead.length > 0 &&
    onHead.every(({ by }) => by === "Julian") &&
    !memory.reported.has(outsideKey(pull))
  );
}

/**
 * Julian approved the head but, by the HAL-14809 rules the queue gate uses,
 * his approval doesn't count there and nobody else's does: the pull request
 * is Liam's by its paths and it isn't a re-approval after a rebase-only push
 * Liam approved.
 */
export function julianRefused(pull: PullFacts, byPaths: Reviewer): boolean {
  const judged = judgeApprovals(pull.approvals ?? [], {
    head: pull.head,
    author: branchOwner(pull.branch),
    reviewer: byPaths,
  }).filter(({ head }) => pull.head.startsWith(head));
  return (
    judged.some(({ by, counts }) => by === "Julian" && !counts) &&
    !judged.some(({ counts }) => counts)
  );
}

/** Nothing on it waits for its author: out of draft, mergeable, no open finding, and green or approved. */
function settled(pull: PullFacts, refused: Refused): boolean {
  if (pull.draft || pull.conflicting || pull.retargeted || pull.latestReview !== undefined) {
    return false;
  }
  return approvedOnHead(pull, refused) || pull.inQueue || pull.ciOkOnHead === "success";
}

/**
 * The open pull requests that wait for a reviewer, when the task can go to
 * one: every open pull request is settled, at least one isn't approved on
 * its head, and the watcher hasn't handed this head over before. None when
 * the task has an open child task (a security or release pull request's
 * review task among them) or its author's newest comment says the pull
 * request has a review task of its own. A pull request in `refused` counts
 * as not approved.
 */
export function waitingForReview(
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
  refused: Refused = none,
): PullFacts[] {
  if (task.openChildren || memory.ownReview === true) {
    return [];
  }
  const open = pulls.filter((pull) => pull.state === "open");
  if (open.length === 0 || !open.every((pull) => settled(pull, refused))) {
    return [];
  }
  const waiting = open.filter((pull) => !approvedOnHead(pull, refused) && !pull.inQueue);
  return waiting.some((pull) => !memory.reported.has(handoffKey(pull, refused))) ? waiting : [];
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
export function handoffMessage(
  pulls: readonly PullFacts[],
  reviewer: Reviewer,
  refused: Refused = none,
): string {
  const name = reviewer === "julian" ? "Julian" : "Liam";
  const lines = pulls.map(
    (pull) =>
      `PR watcher: ready for review: [#${pull.number}](${pull.url}), head \`${short(pull.head)}\`.`,
  );
  const outside = pulls
    .filter((pull) => refused.has(pullId(pull)))
    .map(
      (pull) =>
        `Julian's approval on #${pull.number} doesn't count: it touches Liam's paths (HAL-14809), so Liam reviews it.`,
    );
  return [
    ...lines,
    "",
    ...outside,
    `Out of draft with a green \`ci-ok\`, so the task goes to ${name}.`,
    ...pulls.map((pull) => marker(handoffKey(pull, refused))),
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
