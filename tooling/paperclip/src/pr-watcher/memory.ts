import type { Memory } from "./decide.ts";
import type { CommentRow } from "./paperclip.ts";
import { queueRequestsOf } from "./unneeded-rebase.ts";

/**
 * What the watcher remembers about a task, read from its comments: the
 * markers of what it reported, the author's hold line and when the author
 * and anyone else last wrote. Rules only, no I/O.
 */

/** The memory of a task whose comments weren't read. */
export const emptyMemory: Memory = {
  reported: new Set<string>(),
  seenUntil: undefined,
  heldAt: undefined,
  lastCommentAt: undefined,
};

const markerPattern = /<!-- pr-watcher: (.+?) -->/g;

/** The line an author puts in a task comment to keep the task open after a merge. */
const holdPattern = /^[ \t]*PR watcher: more PRs to come[ \t.]*$/im;

/** The line an author of a security or release pull request puts in a task comment: its review has a task of its own. */
const ownReviewPattern = /^[ \t]*PR watcher: own review task[ \t.]*$/im;

/**
 * A comment the watcher wrote. The host stores no plugin id on a plugin's
 * comment, so it is one with neither an agent nor a user as author that
 * starts with the watcher's name.
 */
export function isSelf(comment: CommentRow): boolean {
  return (
    comment.authorAgentId === null &&
    comment.authorUserId === null &&
    comment.body.startsWith("PR watcher:")
  );
}

/** When the newest of these comments was written. */
function newestAt(comments: readonly CommentRow[]): string | undefined {
  return comments.reduce<string | undefined>(
    (newest, comment) =>
      newest === undefined || comment.createdAt > newest ? comment.createdAt : newest,
    undefined,
  );
}

/** What the watcher reported before, from its own comments and the author's. */
export function readMemory(comments: readonly CommentRow[], ownerId: string): Memory {
  const reported = new Set<string>();
  let seenUntil: string | undefined;
  for (const comment of comments) {
    const self = isSelf(comment);
    if (self) {
      for (const match of comment.body.matchAll(markerPattern)) {
        reported.add(match[1] ?? "");
      }
    }
    const counts = self || comment.authorAgentId === ownerId;
    if (counts && (seenUntil === undefined || comment.createdAt > seenUntil)) {
      seenUntil = comment.createdAt;
    }
  }
  const authorLast = comments
    .filter((comment) => comment.authorAgentId === ownerId)
    .reduce<CommentRow | undefined>(
      (newest, comment) =>
        newest === undefined || comment.createdAt > newest.createdAt ? comment : newest,
      undefined,
    );
  return {
    reported,
    seenUntil,
    heldAt: holdPattern.test(authorLast?.body ?? "") ? authorLast?.createdAt : undefined,
    ownReview: ownReviewPattern.test(authorLast?.body ?? ""),
    authorLastAt: newestAt(comments.filter((comment) => comment.authorAgentId === ownerId)),
    lastCommentAt: newestAt(comments.filter((comment) => !isSelf(comment))),
    queueRequests: queueRequestsOf(
      comments.filter((comment) => !isSelf(comment)).map(({ body }) => body),
    ),
  };
}
