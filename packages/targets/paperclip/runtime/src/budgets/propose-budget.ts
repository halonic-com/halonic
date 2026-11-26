import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { ApprovalRecord, ToolResult } from "../host.ts";
import { writeMode } from "../paperclip-writes.ts";
import {
  type BudgetRow,
  compareBudgets,
  compareProjectBudgets,
  workspaceBudgets,
} from "./budgets.ts";
import { listAgents, listProjects } from "./list-limit.ts";

/**
 * The `paperclip.propose-budget` action (plan HAL-17960, PR 2): for each
 * agent's and project's monthly budget where the workspace and Paperclip
 * differ, the budget approval it would ask the board for, naming the tool
 * file and commit the new amount comes from and the old and new amounts.
 * A budget with a budget approval already pending is reported, not proposed
 * again. The board's yes on the approval is the only thing that would change
 * a budget; this action never changes one.
 *
 * Paperclip's plugin SDK can read approvals but not file one, so `mode:
 * write` files nothing either and says why (HAL-20033). Until it can, every
 * answer is a dry run.
 */

/** The approval type Paperclip uses for a budget, shown in Studio as "Monthly budget". */
export const BUDGET_APPROVAL_TYPE = "budget_override_required";

/** Whose budget: an agent's or a project's, as Paperclip's approval payload names it. */
export type BudgetScope = "agent" | "project";

/** Where the new amount comes from: the tool file in the workspace and its commit. */
export interface ProposalSource {
  readonly file: string;
  readonly commit: string;
}

/** One budget change the action would ask the board for. Amounts in cents; null for none. */
export interface BudgetProposal {
  readonly scope: BudgetScope;
  readonly id: string;
  readonly urlKey: string;
  readonly name: string;
  readonly oldCents: number | null;
  readonly newCents: number;
  readonly source: ProposalSource;
}

/** A budget that differs but already has a budget approval pending, so nothing more is proposed. */
export interface PendingBudget {
  readonly scope: BudgetScope;
  readonly urlKey: string;
  readonly name: string;
  readonly approvalId: string;
}

/** What the action found: what it would propose and what it skipped as already pending. */
export interface ProposalPlan {
  readonly proposals: readonly BudgetProposal[];
  readonly pending: readonly PendingBudget[];
}

/** Something Paperclip lists, with the id an approval's payload names it by. */
interface Known {
  readonly id: string;
  readonly urlKey: string;
}

/**
 * The tool file a tool comes from, as the format places it.
 *
 * @example
 * toolFile("budgets"); // "library/tools/budgets.tool.yaml"
 */
export function toolFile(toolId: string): string {
  return `library/tools/${toolId}.tool.yaml`;
}

/** A row the board could decide on: Paperclip has it, and its budget differs or is missing. */
function wantsChange(row: BudgetRow): row is BudgetRow & { name: string; workspaceCents: number } {
  const differs = row.match === "different" || row.match === "unknown-in-paperclip";
  return differs && row.name !== null && row.workspaceCents !== null;
}

/** The scope and id a pending budget approval is for, or null when its payload doesn't say. */
function approvalScope(approval: ApprovalRecord): string | null {
  const { scopeType, scopeId } = approval.payload;
  if (typeof scopeType !== "string" || typeof scopeId !== "string") return null;
  return `${scopeType}:${scopeId}`;
}

/** The pending budget approvals by `scope:id`. */
function pendingByScope(approvals: readonly ApprovalRecord[]): Map<string, ApprovalRecord> {
  const pending = new Map<string, ApprovalRecord>();
  for (const approval of approvals) {
    if (approval.type !== BUDGET_APPROVAL_TYPE || approval.status !== "pending") continue;
    const scope = approvalScope(approval);
    if (scope !== null && !pending.has(scope)) pending.set(scope, approval);
  }
  return pending;
}

/**
 * Splits the rows of one scope into proposals and budgets already pending.
 *
 * @example
 * planScope("agent", rows, [{ id: "a1", urlKey: "mateo" }], new Map(), source);
 * // { proposals: [{ scope: "agent", id: "a1", urlKey: "mateo", ... }], pending: [] }
 */
export function planScope(
  scope: BudgetScope,
  rows: readonly BudgetRow[],
  known: readonly Known[],
  pending: ReadonlyMap<string, ApprovalRecord>,
  source: ProposalSource,
): ProposalPlan {
  const idOf = new Map(known.map((item) => [item.urlKey, item.id]));
  const proposals: BudgetProposal[] = [];
  const skipped: PendingBudget[] = [];
  for (const row of rows.filter(wantsChange)) {
    const id = idOf.get(row.urlKey);
    if (id === undefined) continue;
    const approval = pending.get(`${scope}:${id}`);
    if (approval !== undefined) {
      skipped.push({ scope, urlKey: row.urlKey, name: row.name, approvalId: approval.id });
      continue;
    }
    const { urlKey, name, paperclipCents: oldCents, workspaceCents: newCents } = row;
    proposals.push({ scope, id, urlKey, name, oldCents, newCents, source });
  }
  return { proposals, pending: skipped };
}

/** Cents as dollars, such as `$12.50`, or `none`. */
function dollars(cents: number | null): string {
  return cents === null ? "none" : `$${(cents / 100).toFixed(2)}`;
}

/** One proposal in words, such as `- agent Mateo (mateo): $40.00 to $50.00`. */
function proposalLine(proposal: BudgetProposal): string {
  const { scope, name, urlKey, oldCents, newCents } = proposal;
  return `- ${scope} ${name} (${urlKey}): ${dollars(oldCents)} to ${dollars(newCents)}`;
}

/** One skipped budget in words. */
function pendingLine(budget: PendingBudget): string {
  return `- ${budget.scope} ${budget.name} (${budget.urlKey}): budget approval ${budget.approvalId} is already pending, so nothing more is proposed`;
}

/** The answer's opening line, by mode. */
function opening(call: ActionCall): string {
  if (writeMode(call.tool) === "write") {
    return "Not filed: Paperclip doesn't let a plugin file a budget approval yet (HAL-20033), so this answers as a dry run.";
  }
  return "Dry run: nothing was filed; turning on writing is the board's step.";
}

/** The answer: what it would ask the board for, from which file and commit, and what it skipped. */
function answer(call: ActionCall, plan: ProposalPlan, source: ProposalSource): ToolResult {
  const { proposals, pending } = plan;
  const lines = [
    opening(call),
    proposals.length === 0
      ? "No budget approval to propose: every budget Paperclip has matches the workspace, or already waits on the board."
      : `Would ask the board for ${proposals.length} budget approvals, each a monthly budget from ${source.file} at commit ${source.commit}:`,
    ...proposals.map(proposalLine),
    ...pending.map(pendingLine),
  ];
  return {
    content: lines.join("\n"),
    data: { mode: "dry-run", proposals, pending },
  };
}

/** Plans the proposals for the agents and projects the tool's settings name. */
async function proposalPlan(call: ActionCall, source: ProposalSource): Promise<ProposalPlan> {
  const { paperclip, companyId, tool } = call;
  const [agents, projects, approvals] = await Promise.all([
    listAgents(call),
    listProjects(call),
    paperclip.approvals.list({ companyId, status: "pending" }),
  ]);
  const pending = pendingByScope(approvals);
  const agentRows = compareBudgets(workspaceBudgets(tool, "agents"), agents.items);
  const projectRows = compareProjectBudgets(workspaceBudgets(tool, "projects"), projects.items);
  const forAgents = planScope("agent", agentRows, agents.items, pending, source);
  const forProjects = planScope("project", projectRows, projects.items, pending, source);
  return {
    proposals: [...forAgents.proposals, ...forProjects.proposals],
    pending: [...forAgents.pending, ...forProjects.pending],
  };
}

/** Says which budget approvals it would file. Reads agents, projects and pending approvals only. */
export const proposeBudgetHandler: ActionHandler = {
  // Reading only: the approval list is `approvals.read` (HAL-20034), never `decide`.
  capabilities: ["agents.read", "projects.read", "approvals.read"],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.propose-budget") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.propose-budget.` };
    }
    const source = { file: toolFile(tool.id), commit: call.workspaceCommit };
    try {
      return answer(call, await proposalPlan(call, source), source);
    } catch (error) {
      // Without the pending approvals it can't rule out a duplicate, so it proposes nothing.
      return {
        error: `${tool.name}: couldn't read the budgets or the pending approvals, so it proposes nothing (${(error as Error).message}).`,
      };
    }
  },
};
