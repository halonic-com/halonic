/**
 * How a card's final-state line starts (`kit.final-state`, HAL-19496): the five ways a card ends,
 * and how an action it asked for ended (Noah's check on HAL-18476).
 */
export const finalStateWords = {
  approved: "Approved",
  rejected: "Rejected",
  answered: "Answered",
  cancelled: "Cancelled",
  expired: "Expired",
  /** How an action card ended, as its line says it. */
  outcomes: {
    succeeded: "Succeeded",
    failed: "Failed",
    declined: "Declined",
    expired: "Expired",
  },
  /** Who, after the word: "by you", "by Ada". */
  by: (name: string) => `by ${name}`,
  you: "you",
} as const;
