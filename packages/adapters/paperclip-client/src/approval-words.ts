/**
 * What each Paperclip approval type asks, in words, as the item's title says it
 * (`paperclip-client.approval-fields`). A type that isn't listed reads "Approval: <type>".
 */
export const approvalTypeWords: ReadonlyMap<string, string> = new Map([
  ["hire_agent", "Hire an agent"],
  ["approve_ceo_strategy", "Strategy approval"],
  ["budget_override_required", "Budget override"],
  ["request_board_approval", "Board approval"],
]);

/** The words an approval or a confirmation shows besides its type, in one place for copy checks. */
export const approvalWords = {
  unknownType: (type: string) => `Approval: ${type}`,
  approve: "Approve",
  reject: "Reject",
  requestChanges: "Request changes",
  // The labels of the note fields under Request changes and a Reject that needs a reason (HAL-18924).
  whatShouldChange: "What should change?",
  rejectReason: "Why are you rejecting this?",
  name: "Name",
  role: "Role",
  adapter: "Adapter",
  monthlyBudget: "Monthly budget",
  recommendedAction: "Recommended action",
  risks: "Risks",
  plan: "Plan",
  budgetFor: "For",
  limit: "Limit",
  spent: "Spent",
  // Approve and Reject resolve the budget incident (HAL-18921): raise and resume, or keep paused.
  budgetApproving:
    "Approving raises the limit to the amount you enter and resumes the paused work. Rejecting keeps the work paused.",
  // The label of Approve's field on a budget override, and why an amount was refused.
  newLimit: "New limit, in dollars",
  newLimitUnreadable: "Enter the new limit in dollars, such as 250 or 250.50.",
  newLimitTooLow: (spent: string) => `The new limit must be more than the ${spent} already spent.`,
  noBudgetStop: "Paperclip has no budget stop open for this approval. Answer it in Paperclip.",
  budgetRefused: (detail: string | undefined) =>
    detail === undefined
      ? "Paperclip didn't change the budget."
      : `Paperclip didn't change the budget: ${detail}`,
  document: "Document",
  revision: (number: number) => `revision ${number}`,
  tool: "Tool",
  arguments: "Arguments",
} as const;
