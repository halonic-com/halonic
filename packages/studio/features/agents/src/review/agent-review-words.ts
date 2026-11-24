// The words of the assistant's changes to review on an agent's page (AI changes 1.3; T14 review
// panel notes 2 and 5, HAL-1307). The bar and the marks say theirs in the shell's words.

/** What the agent page says as its changes to review are decided. */
export const agentReviewWords = {
  /** The toast after a decision: "Accepted 3 changes in Support triage". */
  decided: (verb: "accept" | "reject", count: number, name: string): string =>
    `${verb === "accept" ? "Accepted" : "Rejected"} ${count} ${count === 1 ? "change" : "changes"} in ${name}`,
  undo: "Undo",
  /** Said politely when an edit inside a change accepted it (note 2). */
  acceptedByEdit: "Change accepted by your edit",
  /** A change that overlaps another can only be decided with the rest of the file. */
  cantSeparate: "This change can't be decided on its own. Use Accept all or Reject all.",
};
