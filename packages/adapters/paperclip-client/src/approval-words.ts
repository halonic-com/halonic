/**
 * What each Paperclip approval type asks, in words, as the item's title says it
 * (`paperclip-client.approval-fields`). A type that isn't listed reads "Approval: <type>".
 */
export const approvalTypeWords: ReadonlyMap<string, string> = new Map([
  ["hire_agent", "Hire an agent"],
  ["approve_ceo_strategy", "Approve the strategy"],
  ["budget_override_required", "Budget override"],
  ["request_board_approval", "Board approval"],
]);

/** The words an approval or a confirmation shows besides its type, in one place for copy checks. */
export const approvalWords = {
  unknownType: (type: string) => `Approval: ${type}`,
  approve: "Approve",
  reject: "Reject",
  requestChanges: "Request changes",
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
  // Paperclip's approve route only records the answer; the budget is raised from Paperclip's budget page.
  budgetApproving:
    "Approving records your answer only. The budget stays the same and the work stays paused until you raise the budget in Paperclip.",
  document: "Document",
  revision: (number: number) => `revision ${number}`,
  tool: "Tool",
  arguments: "Arguments",
} as const;
