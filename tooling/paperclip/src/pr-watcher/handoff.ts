import { judgeApprovals } from "../pr-tools/approvals.ts";
import {
  approvalRole,
  limitedReviewerNames as limitedReviewers,
  type Reviewer,
  reviewerNames,
} from "../reviewer-paths-who.ts";
import { type Answers, answeredKey, answerLine } from "./answered.ts";
import { carriedOnHead } from "./carry-over.ts";
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

export type { Reviewer };

/** What a pull request's paths say: its reviewer, and whether they make it a security one. */
export interface PathReview {
  readonly reviewer: Reviewer;
  readonly security: boolean;
  /** Why Julian's rebase-only re-approval can't count on it (`julianRebaseRefusal`), or null when it can. */
  readonly rebaseRefusal?: string | null;
  /** Why Nora's approval can't count on it (`routineRefusal`), or null when it can. */
  readonly routineRefusal?: string | null;
}

/** The path rules (`reviewerFor`, `isSecurityPath`), read from GitHub for one pull request. */
export type ReviewerRoute = (pull: PullFacts) => Promise<PathReview>;

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

/**
 * Pull requests whose approvals on the head don't count (Julian or Nora
 * outside their limits), with the line that says who approved and why.
 */
export type Refused = ReadonlyMap<string, string>;

const none: Refused = new Map();

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

/** The key of this head's handoff: after an answered finding, after Julian's refused approval, or when ready. */
export function handoffKey(
  pull: PullFacts,
  refused: Refused,
  answers: Answers = noAnswers,
): string {
  if (answers.has(pullId(pull))) {
    return answeredKey(pull);
  }
  return refused.has(pullId(pull)) ? outsideKey(pull) : readyKey(pull);
}

const noAnswers: Answers = new Map();

/**
 * Its only approvals on the head are Julian's or Nora's, on a pull request
 * neither Liam nor Julian wrote: whether they count depends on its paths, so
 * the watcher reads them (`julianRefused`) unless it already handed this
 * head on.
 */
export function julianOnlyOnHead(pull: PullFacts, memory: Memory): boolean {
  const author = branchOwner(pull.branch);
  if (pull.state !== "open" || pull.inQueue || author === "liam" || author === "julian") {
    return false;
  }
  const onHead = othersApprovals(pull).filter(({ head }) => pull.head.startsWith(head));
  return (
    onHead.length > 0 &&
    onHead.every(({ by }) => limitedReviewers.includes(by)) &&
    !memory.reported.has(outsideKey(pull))
  );
}

/**
 * Julian or Nora approved the head but, by the rules the queue gate uses,
 * the approval doesn't count there and nobody else's does: the pull request
 * is Liam's by its paths and it isn't a re-approval after a rebase-only push
 * Liam approved, on a pull request `julianRebaseRefusal` allows (HAL-18459),
 * or Nora's is outside the routine scope (HAL-19283).
 */
export function julianRefused(pull: PullFacts, paths: PathReview): boolean {
  return refusalOf(pull, paths) !== null;
}

/** Who approved and why it doesn't count, for the handoff, or null when an approval counts. */
export function refusalOf(pull: PullFacts, paths: PathReview): string | null {
  const judged = judgeApprovals(pull.approvals ?? [], {
    head: pull.head,
    author: branchOwner(pull.branch),
    reviewer: approvalRole(paths.reviewer),
    ...(paths.rebaseRefusal === undefined ? {} : { rebaseRefusal: paths.rebaseRefusal }),
    ...(paths.routineRefusal === undefined ? {} : { routineRefusal: paths.routineRefusal }),
  }).filter(({ head }) => pull.head.startsWith(head));
  const by = [
    ...new Set(
      judged
        .filter(({ by, counts }) => limitedReviewers.includes(by) && !counts)
        .map(({ by }) => by),
    ),
  ];
  if (by.length === 0 || judged.some(({ counts }) => counts)) {
    return null;
  }
  const why =
    paths.reviewer === "liam"
      ? "only the code reviewer may approve it (HAL-14809)"
      : `it is outside the routine scope (${paths.routineRefusal ?? "its paths"}, HAL-19283)`;
  return `${by.join(" and ")}'s approval on #${pull.number} doesn't count: ${why}.`;
}

/** Approved on its head, or the watcher recorded that an approval carries to it (HAL-18460). */
function approvedOrCarried(pull: PullFacts, refused: Refused, memory: Memory): boolean {
  return approvedOnHead(pull, refused) || carriedOnHead(pull, memory);
}

/**
 * Nothing on it waits for its author: out of draft, mergeable, no open
 * finding the author hasn't answered (`answers`), and green or approved.
 */
function settled(pull: PullFacts, refused: Refused, answers: Answers, memory: Memory): boolean {
  if (pull.draft || pull.conflicting || pull.retargeted) {
    return false;
  }
  if (pull.latestReview !== undefined && !answers.has(pullId(pull))) {
    return false;
  }
  return approvedOrCarried(pull, refused, memory) || pull.inQueue || pull.ciOkOnHead === "success";
}

/**
 * The open pull requests that wait for a reviewer, when the task can go to
 * one: every open pull request is settled, at least one isn't approved on
 * its head, and the watcher hasn't handed this head over before. None when
 * the task has an open child task (a security or release pull request's
 * review task among them) or its author's newest comment says the pull
 * request has a review task of its own. A pull request in `refused` counts
 * as not approved, one whose approval the watcher found carries to its head
 * counts as approved, and one with an open finding waits only once its
 * author answered it (`answers`).
 */
export function waitingForReview(
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
  refused: Refused = none,
  answers: Answers = noAnswers,
): PullFacts[] {
  if (task.openChildren || memory.ownReview === true) {
    return [];
  }
  const open = pulls.filter((pull) => pull.state === "open");
  if (open.length === 0 || !open.every((pull) => settled(pull, refused, answers, memory))) {
    return [];
  }
  const waiting = open.filter((pull) => !approvedOrCarried(pull, refused, memory) && !pull.inQueue);
  const unreported = (pull: PullFacts) => !memory.reported.has(handoffKey(pull, refused, answers));
  return waiting.some(unreported) ? waiting : [];
}

/** The newest approval by someone else, on an older head, of a pull request not approved on its head. */
export function approvedBefore(pull: PullFacts): { by: string; head: string } | undefined {
  return approvedOnHead(pull) ? undefined : othersApprovals(pull).at(-1);
}

/**
 * What changed since a pull request's last approval: only a rebase, or more
 * (HAL-17759). A security pull request by its paths is never compared, so
 * never rebase-only: it keeps its own gate (HAL-17901).
 */
export interface SinceApproval {
  readonly by: string;
  readonly approvedHead: string;
  readonly rebaseOnly: boolean;
  readonly security?: boolean;
  /**
   * The watcher rebased it off a merged base since the approval (HAL-18031),
   * so the approved head's diff from `main` still holds the base's commits.
   */
  readonly stacked?: boolean;
}

/** `SinceApproval` by `pullId`, for the pull requests approved on an older head. */
export type SinceApprovals = ReadonlyMap<string, SinceApproval>;

function sinceLine(
  pull: PullFacts,
  since: SinceApproval | undefined,
  reviewer: Reviewer,
): string[] {
  if (since === undefined) {
    return [];
  }
  const old = short(since.approvedHead);
  if (since.security === true) {
    return [
      `#${pull.number}: a security pull request by its paths, so no rebase-only re-approval (HAL-14809); review \`${old}\`..\`${short(pull.head)}\`.`,
    ];
  }
  if (!since.rebaseOnly) {
    return [
      `#${pull.number}: changed since ${since.by}'s approval on \`${old}\`; review \`${old}\`..\`${short(pull.head)}\`.`,
    ];
  }
  const line =
    reviewer === "julian"
      ? ` If so: "Julian: re-approved on head \`${short(pull.head)}\` (rebase only, range-diff vs \`${old}\`)".`
      : "";
  return [
    `#${pull.number}: only a rebase since ${since.by}'s approval on \`${old}\` (same changes on GitHub); check with \`git range-diff\`.${line}`,
  ];
}

/** The comment that hands the task to its reviewer. */
export function handoffMessage(
  pulls: readonly PullFacts[],
  reviewer: Reviewer,
  refused: Refused = none,
  since: SinceApprovals = new Map(),
  answers: Answers = noAnswers,
): string {
  const name = reviewerNames[reviewer];
  const lines = pulls.map(
    (pull) =>
      `PR watcher: ready for review: [#${pull.number}](${pull.url}), head \`${short(pull.head)}\`.`,
  );
  const changed = pulls.flatMap((pull) => sinceLine(pull, since.get(pullId(pull)), reviewer));
  const answered = pulls.flatMap((pull) => {
    const answer = answers.get(pullId(pull));
    return answer === undefined ? [] : [answerLine(pull, answer)];
  });
  const outside = pulls.flatMap((pull) => {
    const line = refused.get(pullId(pull));
    return line === undefined ? [] : [line];
  });
  return [
    ...lines,
    "",
    ...changed,
    ...answered,
    ...outside,
    `Out of draft with a green \`ci-ok\`, so the task goes to ${name}.`,
    ...pulls.map((pull) => marker(handoffKey(pull, refused, answers))),
  ].join("\n");
}

/** The key of the one warning about pushes after the approval of `approvedHead`. */
export function pushedKey(pull: PullFacts, approvedHead: string): string {
  return `${at(pull, approvedHead)} pushed after approval`;
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
    if (pull.state !== "open" || pull.draft || pull.conflicting) {
      return [];
    }
    const newest = approvedBefore(pull);
    if (newest === undefined) {
      return [];
    }
    const approved = at(pull, newest.head);
    const key = pushedKey(pull, newest.head);
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
