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
  /** Under a why cut at 3 lines: shows the rest (flow-assistant 3.2). */
  more: "more",
  /** New (HAL-18399): the change was written after the assistant read docs pages from these sites. */
  writtenAfterReading: (sites: readonly string[]) => `Written after reading ${sites.join(", ")}`,
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
  /** New (HAL-18075): said once Undo put the card's changes back to review. */
  undone: (count: number, name: string) =>
    `Undone. ${count} ${changes(count)} in ${name} ${count === 1 ? "is" : "are"} back to review.`,
  /** New (HAL-16798): a decision or its undo that failed, with the reason under it. */
  cantAccept: (name: string) => `Couldn't accept the changes in ${name}`,
  cantReject: (name: string) => `Couldn't reject the changes in ${name}`,
  cantUndo: (name: string) => `Couldn't undo it in ${name}`,
  /**
   * New (HAL-16798): the card couldn't read its changes, so it keeps only Review. A sentence, so
   * it ends with one full stop even when the reason already has its own.
   */
  cantRead: (reason: string) => `Couldn't read these changes: ${reason.replace(/\.+$/, "")}.`,
  /** The state chips once nothing is left to review (flow-assistant 3.3): `neutral`, never green or ✓. */
  chip: {
    accepted: "Accepted",
    partly: (accepted: number, total: number) => `Accepted ${accepted} of ${total}`,
    rejected: "Rejected",
    replaced: "Replaced",
  },
  /** After an Accept, where the change lives now: "Changes ›" opens Changes. */
  nowAChange: (name: string) => `Now a change in ${name}.`,
  undoItIn: "Undo it in",
  changesLink: "Changes ›",
  newerBelow: "A newer change to this file is below.",
  newerInAnotherChat: "A newer change to this file is in another chat.",
  goToIt: "Go to it",
  replacedOutside: "Replaced by the version from outside Halonic.",
  /** The file changed outside Halonic, so Accept all and Reject all wait (flow-assistant 3.4). */
  changedOutside: (name: string) => `${name} changed outside Halonic. Compare first.`,
  compare: "Compare",
  /** Review panel note 1: a decision on parts the file no longer has reloads quietly. */
  latest: "The file changed. Showing the latest changes.",
  /** On a phone (microcopy 14.3): one button for Review and Show the diff, which opens the sheet. */
  seeWhatChanges: "See what changes",
  whatChanges: "What changes",
  /** Under an open card's buttons on a phone while Halonic on the computer isn't answering (11.6). */
  waitingForComputer: "Waiting for Halonic on your computer.",
} as const;

/**
 * What the model is told about a decision on a card, with the person's next message (flow 3.3).
 * The chat doesn't show these: the card already says it.
 */
export const notesToTheModel = {
  accepted: (path: string) => `(The person accepted the changes to ${path}.)`,
  rejected: (path: string) =>
    `(The person rejected the changes to ${path}. The file is back as it was.)`,
  partly: (accepted: number, total: number, path: string) =>
    `(The person accepted ${accepted} of ${total} changes to ${path} and rejected the rest.)`,
  anotherChat: (path: string) =>
    `(Another chat changed ${path}. Its card now covers these changes.)`,
  outside: (path: string) =>
    `(The file ${path} was replaced by a version from outside Halonic. Your changes to it are gone.)`,
} as const;

function changes(count: number): string {
  return count === 1 ? "change" : "changes";
}

/**
 * The words of the strip above the box (microcopy 14.2 and 19.5, flow-assistant 3.5), for two or
 * more items with changes to review from the chat.
 */
export const stripWords = {
  count: (items: number) => `${items} items to review`,
  /** The count is a button that moves focus to the next card's Review. */
  countName: (items: number) => `${items} items to review, go to the next one`,
  /** The count on a phone while the chat answers, so the reason under it doesn't grow the strip. */
  shortCount: (items: number) => `${items} to review`,
  acceptAll: "Accept all",
  rejectAll: "Reject all",
  /** Written under the count while the chat answers: both buttons' reason, not only a tooltip. */
  waitForAnswer: "Wait for the answer to finish.",
  accepted: (changes: number, items: number) =>
    `Accepted ${changes} ${changesWord(changes)} in ${items} ${itemsWord(items)}`,
  rejected: (changes: number, items: number) =>
    `Rejected ${changes} ${changesWord(changes)} in ${items} ${itemsWord(items)}`,
  /** After the toast's title when items were left out, so a partial result never reads as done. */
  waiting: (names: readonly string[]) =>
    `${listed(names)} ${names.length === 1 ? "waits" : "wait"} for Compare.`,
  /** New (HAL-17455): nothing was decided, as every item waits for Compare. */
  nothing: (decision: "accept" | "reject") =>
    decision === "accept" ? "Nothing accepted." : "Nothing rejected.",
  undo: "Undo",
  undone: (decision: "accept" | "reject", changes: number) =>
    `Undone: ${decision === "accept" ? "accepted" : "rejected"} ${changes} ${changesWord(changes)}`,
  /** New (HAL-16800): the strip's decision or its undo failed, with the reason under it. */
  cantAccept: (items: number) => `Couldn't accept the changes in ${items} ${itemsWord(items)}`,
  cantReject: (items: number) => `Couldn't reject the changes in ${items} ${itemsWord(items)}`,
  cantUndo: (items: number) => `Couldn't undo the changes in ${items} ${itemsWord(items)}`,
} as const;

function changesWord(count: number): string {
  return count === 1 ? "change" : "changes";
}

function itemsWord(count: number): string {
  return count === 1 ? "item" : "items";
}

/** "A", "A and B", "A, B and C", then "A, B, C and 2 more" (HAL-17455). */
function listed(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
