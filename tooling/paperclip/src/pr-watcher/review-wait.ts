import { amsterdamTime } from "../amsterdam-time.ts";
import { marker, type PullFacts, short } from "./decide.ts";
import { approvedOnHead, readyKey } from "./handoff.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";

/**
 * A review that waits too long (HAL-17760): a task its reviewer holds, with a
 * green pull request the watcher handed over more than an hour ago and still
 * no approval on that head, gets one note per head and its priority raised to
 * `high` (HAL-17920). It wakes nobody; the counts and the waits, oldest first,
 * go to the pass summary, so Chief's team check can list them. Rules here,
 * the comments and the clock come from `watch.ts`.
 */

/** How long a handed-over head may wait for its approval before the note. */
export const reviewWaitLimitMs = 60 * 60 * 1000;

/** The priority a long wait raises a task to. `critical` stays a person's call. */
export const waitPriority = "high";

/** The priorities a long wait raises; a person's `high` or `critical` is never touched, nor lowered. */
const raisable: ReadonlySet<string> = new Set(["low", "medium"]);

/** The key of the note for this head: once per head. */
export function reviewWaitKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} review wait`;
}

/** A pull request waiting for its review, and when the watcher handed it over. */
export interface ReviewWait {
  readonly pull: PullFacts;
  readonly handedAt: string;
}

/** Out of draft, green on its head, not in the queue and not approved on its head. */
export function waitsForApproval(pull: PullFacts): boolean {
  return (
    pull.state === "open" &&
    !pull.draft &&
    !pull.inQueue &&
    pull.ciOkOnHead === "success" &&
    !approvedOnHead(pull)
  );
}

/** When the watcher's comment carrying `key` was written, the oldest if there are several. */
function writtenAt(own: readonly CommentRow[], key: string): string | undefined {
  const line = marker(key);
  return own
    .filter((comment) => comment.body.includes(line))
    .reduce<string | undefined>(
      (oldest, comment) =>
        oldest === undefined || comment.createdAt < oldest ? comment.createdAt : oldest,
      undefined,
    );
}

function overLimit(handedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(handedAt) > reviewWaitLimitMs;
}

/** The pull requests that wait for their approval on a head the watcher handed over, whenever that was. */
function handedOver(pulls: readonly PullFacts[], own: readonly CommentRow[]): ReviewWait[] {
  return pulls.flatMap((pull): ReviewWait[] => {
    const handedAt = waitsForApproval(pull) ? writtenAt(own, readyKey(pull)) : undefined;
    return handedAt === undefined ? [] : [{ pull, handedAt }];
  });
}

/**
 * The pull requests to note: each waits for its approval, the watcher's
 * "ready for review" comment for its head is more than an hour old, and the
 * watcher hasn't noted this head yet. `own` holds only the watcher's comments.
 */
export function reviewWaits(
  pulls: readonly PullFacts[],
  own: readonly CommentRow[],
  now: Date,
): ReviewWait[] {
  return handedOver(pulls, own).filter(
    ({ pull, handedAt }) =>
      overLimit(handedAt, now) && writtenAt(own, reviewWaitKey(pull)) === undefined,
  );
}

/** What else the queue will miss on the head: `; no \`Guard notes\` run on this head`, or nothing. */
function missingText(pull: PullFacts): string {
  const missing = pull.missingChecks ?? [];
  if (missing.length === 0) {
    return "";
  }
  return `; no ${missing.map((name) => `\`${name}\``).join(" or ")} run on this head`;
}

/** The note on the task: one line per pull request, then the markers. */
export function reviewWaitMessage(waits: readonly ReviewWait[]): string {
  return [
    ...waits.map(
      ({ pull, handedAt }) =>
        `PR watcher: waiting for review for over 1 h: #${pull.number}, head \`${short(pull.head)}\`, handed over at ${amsterdamTime(handedAt)}${missingText(pull)}.`,
    ),
    ...waits.map(({ pull }) => marker(reviewWaitKey(pull))),
  ].join("\n");
}

/** One head waiting for its review, for the pass summary's "longest waiting" line. */
export interface WaitRow {
  readonly task: string;
  readonly pull: string;
  readonly handedAt: string;
  /** Hours since the handoff, to one decimal. */
  readonly hours: number;
}

/** The waits, oldest handoff first. */
export function oldestFirst(waits: readonly WaitRow[]): WaitRow[] {
  return [...waits].sort((one, other) => one.handedAt.localeCompare(other.handedAt));
}

/** The pass summary's line: up to `limit` waits, oldest first, or nothing when none wait. */
export function longestWaitingLine(waits: readonly WaitRow[], limit = 5): string | undefined {
  if (waits.length === 0) {
    return undefined;
  }
  const shown = oldestFirst(waits)
    .slice(0, limit)
    .map(({ task, pull, hours }) => `${task} ${pull} ${hours.toFixed(1)} h`);
  return `PR watcher: longest waiting for review: ${shown.join(", ")}.`;
}

/** What the review-wait step needs from the pass. */
export interface ReviewWaitOptions {
  readonly paperclip: Paperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  readonly now: Date;
}

/** What the review-wait step did for one task. */
export interface ReviewWaitOutcome {
  /** It wrote the note (or would have, in a dry run). */
  readonly noted: boolean;
  /** It raised the task's priority (or would have, in a dry run). */
  readonly raised: boolean;
  readonly waits: readonly WaitRow[];
}

/** The outcome for a task with nothing waiting. */
export const noReviewWait: ReviewWaitOutcome = { noted: false, raised: false, waits: [] };

async function writeNote(
  options: ReviewWaitOptions,
  task: TaskRow,
  waits: readonly ReviewWait[],
): Promise<boolean> {
  if (waits.length === 0) {
    return false;
  }
  const body = reviewWaitMessage(waits);
  options.log(
    `${task.identifier}: waiting for review${options.dryRun ? " (dry run)" : ""}\n${body}`,
  );
  return options.dryRun || (await options.paperclip.note(task.id, body)) === "written";
}

/** Raises a `low` or `medium` task to `high`; any other priority, or an unknown one, stays. */
async function raisePriority(options: ReviewWaitOptions, task: TaskRow): Promise<boolean> {
  if (task.priority === undefined || !raisable.has(task.priority)) {
    return false;
  }
  options.log(
    `${task.identifier}: priority ${task.priority} to ${waitPriority}, waiting for review over 1 h${options.dryRun ? " (dry run)" : ""}`,
  );
  return (
    options.dryRun || (await options.paperclip.raisePriority(task.id, waitPriority)) === "written"
  );
}

function hoursSince(handedAt: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(handedAt)) / 360_000) / 10;
}

/**
 * For a task its reviewer holds with no run going: notes once per head a
 * green pull request that waits for its approval for over an hour, raises the
 * task to `high` while one does, and lists every handed-over head still
 * waiting. The comments are read only when one of the pull requests waits for
 * approval.
 */
export async function noteReviewWait(
  options: ReviewWaitOptions,
  task: TaskRow,
  pulls: readonly PullFacts[],
  ownComments: () => Promise<readonly CommentRow[]>,
): Promise<ReviewWaitOutcome> {
  if (!pulls.some(waitsForApproval)) {
    return noReviewWait;
  }
  const own = await ownComments();
  const handed = handedOver(pulls, own);
  const noted = await writeNote(options, task, reviewWaits(pulls, own, options.now));
  const long = handed.some(({ handedAt }) => overLimit(handedAt, options.now));
  const raised = long && (await raisePriority(options, task));
  const waits = handed.map(({ pull, handedAt }) => ({
    task: task.identifier,
    pull: `#${pull.number}`,
    handedAt,
    hours: hoursSince(handedAt, options.now),
  }));
  return { noted, raised, waits };
}
