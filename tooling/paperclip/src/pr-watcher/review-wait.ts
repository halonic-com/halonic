import { marker, type PullFacts, short, type WatchedTask } from "./decide.ts";
import { approvedOnHead, readyKey } from "./handoff.ts";
import type { CommentRow, Paperclip } from "./paperclip.ts";

/**
 * A review that waits too long (HAL-17760): a task its reviewer holds, with a
 * green pull request the watcher handed over more than an hour ago and still
 * no approval on that head, gets one note per head. It wakes nobody; the
 * count goes to the pass summary, so Chief's team check can list it. Rules
 * here, the comments and the clock come from `watch.ts`.
 */

/** How long a handed-over head may wait for its approval before the note. */
export const reviewWaitLimitMs = 60 * 60 * 1000;

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
  return pulls.flatMap((pull): ReviewWait[] => {
    if (!waitsForApproval(pull) || writtenAt(own, reviewWaitKey(pull)) !== undefined) {
      return [];
    }
    const handedAt = writtenAt(own, readyKey(pull));
    if (handedAt === undefined || now.getTime() - Date.parse(handedAt) <= reviewWaitLimitMs) {
      return [];
    }
    return [{ pull, handedAt }];
  });
}

/** `2026-11-24T16:05:12.000Z` as `2026-11-24 16:05 UTC`. */
function utcMinute(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The note on the task: one line per pull request, then the markers. */
export function reviewWaitMessage(waits: readonly ReviewWait[]): string {
  return [
    ...waits.map(
      ({ pull, handedAt }) =>
        `PR watcher: waiting for review for over 1 h: #${pull.number}, head \`${short(pull.head)}\`, handed over at ${utcMinute(handedAt)}.`,
    ),
    ...waits.map(({ pull }) => marker(reviewWaitKey(pull))),
  ].join("\n");
}

/** What the review-wait step needs from the pass. */
export interface ReviewWaitOptions {
  readonly paperclip: Paperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  readonly now: Date;
}

/**
 * For a task its reviewer holds with no run going: notes once per head a
 * green pull request that waits for its approval for over an hour. The
 * comments are read only when one of the pull requests waits for approval.
 * True when it wrote the note (or would have, in a dry run).
 */
export async function noteReviewWait(
  options: ReviewWaitOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  ownComments: () => Promise<readonly CommentRow[]>,
): Promise<boolean> {
  if (!pulls.some(waitsForApproval)) {
    return false;
  }
  const waits = reviewWaits(pulls, await ownComments(), options.now);
  if (waits.length === 0) {
    return false;
  }
  const body = reviewWaitMessage(waits);
  options.log(
    `${task.identifier}: waiting for review${options.dryRun ? " (dry run)" : ""}\n${body}`,
  );
  return options.dryRun || (await options.paperclip.note(task.id, body)) === "written";
}
