// The words of the assistant's changes to review on an item page (AI changes 1.2 and section 3;
// T14 review panel notes 3 and 4, HAL-1307).

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
  /** The file changed outside Halonic, so Accept and Reject wait for Compare (note 4). */
  changedOutside: "Changed outside Halonic",
  compare: "Compare",
};
