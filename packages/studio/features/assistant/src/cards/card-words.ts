/**
 * The proposal card's words (microcopy 14.2, flow-assistant 3.2 to 3.4). A card never says
 * "Saved" or "Live": saving is the toolbar's word and live is a version's (flow-assistant 4.1).
 */
export const cardWords = {
  /** The tag before the sentence: a fact, not a button. */
  tag: { new: "New", changed: "Changed", delete: "Delete" },
  important: "Important",
  /** The card's sentence: the item's name and Changes' first line for it. */
  sentence: (name: string, line: string) => `${name}: ${line}`,
  /** Changes' own line for a file it can't describe (`describeFileChange`). */
  wholeFile: { changed: "Changed", deleted: "Deleted" },
  /** The `article`'s name, so the card's buttons say which card they are for. */
  cardName: (tag: string, sentence: string) => `${tag}: ${sentence}`,
  showDiff: "Show the diff",
  wholeFileDeleted: "The whole file is deleted.",
  review: "Review",
  acceptAll: "Accept all",
  rejectAll: "Reject all",
  leftToReview: (left: number, total: number) =>
    `${left} of ${total} ${changes(total)} left to review`,
  /** The toasts, with Undo: the item's name, never its path. One phrase, no full stop. */
  accepted: (count: number, name: string) => `Accepted ${count} ${changes(count)} in ${name}`,
  rejected: (count: number, name: string) => `Rejected ${count} ${changes(count)} in ${name}`,
  undo: "Undo",
  /** New (HAL-16798): a decision or its undo that failed, with the reason under it. */
  cantAccept: (name: string) => `Couldn't accept the changes in ${name}`,
  cantReject: (name: string) => `Couldn't reject the changes in ${name}`,
  cantUndo: (name: string) => `Couldn't undo it in ${name}`,
  /**
   * New (HAL-16798): the card couldn't read its changes, so it keeps only Review. A sentence, so
   * it ends with one full stop even when the reason already has its own.
   */
  cantRead: (reason: string) => `Couldn't read these changes: ${reason.replace(/\.+$/, "")}.`,
} as const;

/**
 * What the model is told about a decision on a card, with the person's next message (flow 3.3).
 * The chat doesn't show these: the card already says it.
 */
export const notesToTheModel = {
  accepted: (path: string) => `(The person accepted the changes to ${path}.)`,
  rejected: (path: string) =>
    `(The person rejected the changes to ${path}. The file is back as it was.)`,
} as const;

function changes(count: number): string {
  return count === 1 ? "change" : "changes";
}
