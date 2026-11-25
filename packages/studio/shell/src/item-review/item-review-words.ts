// The words of the assistant's changes to review on an item page (AI changes 1.2 and section 3;
// T14 review panel notes 2 to 5, HAL-1307).

const changeList = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Each change's sentence in curly quotes, joined as plain English: "“A”, “B” and “C”". */
function quotedList(sentences: readonly string[]): string {
  return changeList.format(sentences.map((sentence) => `“${sentence}”`));
}

/** What the item bar and the in-place marks say. */
export const itemReviewWords = {
  /** The bar's name for screen readers: a region among the page's others. */
  barLabel: "Changes to review",
  /** "The assistant changed 3 things here". */
  changedHere: (count: number): string =>
    `The assistant changed ${count} ${count === 1 ? "thing" : "things"} here`,
  /** Where Previous and Next landed, as shown: "1 of 3". */
  position: (at: number, count: number): string => `${at} of ${count}`,
  /** The same, as a screen reader says it: "Change 1 of 3". */
  spokenPosition: (at: number, count: number): string => `Change ${at} of ${count}`,
  previous: "Previous",
  next: "Next",
  acceptAll: "Accept all",
  rejectAll: "Reject all",
  accept: "Accept",
  reject: "Reject",
  /** Reject on the only change of a file the assistant created, which deletes the file (note 3). */
  rejectAndDelete: "Reject and delete file",
  important: "Important",
  /** A mark's name when its change is Important: "Important, Model: small → large". */
  importantChange: (sentence: string): string => `Important, ${sentence}`,
  /**
   * What a screen reader hears for a step card the assistant changed, since its edge shows it
   * only in colour (a11y check RV3).
   */
  stepToReview: {
    added: "Added by the assistant, to review",
    removed: "Removed by the assistant, to review",
    changed: "Changed by the assistant, to review",
  },
  /** The file changed outside Halonic, so Accept and Reject wait for Compare (note 4). */
  changedOutside: "Changed outside Halonic",
  compare: "Compare",
  /** The toast after a decision: "Accepted 3 changes in Support triage" (note 5). */
  decided: (verb: "accept" | "reject", count: number, name: string): string =>
    `${verb === "accept" ? "Accepted" : "Rejected"} ${count} ${count === 1 ? "change" : "changes"} in ${name}`,
  undo: "Undo",
  /** Said politely when an edit inside a change accepted it (note 2). */
  acceptedByEdit: "Change accepted by your edit",
  /** A change that overlaps another can only be decided with the rest of the file. */
  cantSeparate:
    "This change overlaps another, so you can't accept or reject it on its own. Use Accept all or Reject all.",
  /** Under a mark whose Accept also accepts the changes it needs: 'Accepting this also accepts “Step added: Check”'. */
  alsoAccepts: (sentences: readonly string[]): string =>
    `Accepting this also accepts ${quotedList(sentences)}`,
  /** Under a mark whose Reject also rejects the changes that need it (HAL-17353). */
  alsoRejects: (sentences: readonly string[]): string =>
    `Rejecting this also rejects ${quotedList(sentences)}`,
  /** A decision that failed, in the item pages' words. */
  couldntSave: (reason: string): string => `Couldn't save: ${reason}`,
};
