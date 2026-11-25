/**
 * Paperclip approval types that, once approved, neither spend money nor change who may do what.
 * `request_board_approval` only records the board's answer and wakes the agent that asked.
 * Every other type is risky: `hire_agent` adds an agent, `budget_override_required` raises a
 * budget, and `approve_ceo_strategy` lets the CEO start hiring and spending on its plan. A type
 * Paperclip adds later, such as one for an agent's permissions, is risky until it is listed
 * here, so a new kind of approval waits for the desktop instead of being answered on a phone.
 */
const normalApprovalTypes: ReadonlySet<string> = new Set(["request_board_approval"]);

/** How risky approving a Paperclip approval of `type` is; a missing or unknown type is `risky`. */
export function approvalRisk(type: string | undefined): "normal" | "risky" {
  return type !== undefined && normalApprovalTypes.has(type) ? "normal" : "risky";
}
