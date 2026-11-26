import type { Tool } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { AgentRecord, ToolResult } from "../host.ts";
import { listAgents } from "./list-limit.ts";

/**
 * The `paperclip.budgets` action (plan HAL-17450, step 5, read-only): each
 * agent's monthly budget as the workspace's tool file sets it beside the one
 * Paperclip has, with every difference flagged. It only reads: a budget is
 * money, so changing one stays with the board.
 */

/** How one agent's two budgets compare. */
export type BudgetMatch =
  | "same"
  | "different"
  | "not-in-workspace"
  | "not-in-paperclip"
  | "unknown-in-paperclip";

/** One agent's row in the report. Amounts are in cents; null where that side has none. */
export interface BudgetRow {
  readonly urlKey: string;
  /** The agent's name in Paperclip; null when Paperclip has no agent with this url key. */
  readonly name: string | null;
  readonly workspaceCents: number | null;
  readonly paperclipCents: number | null;
  readonly match: BudgetMatch;
}

/** The workspace's budgets from the tool's settings, in cents by url key. */
function workspaceBudgets(tool: Tool): Map<string, number> {
  const settings = tool.action.with;
  const agents = "agents" in settings ? (settings.agents as Record<string, number>) : {};
  return new Map(
    Object.entries(agents).map(([urlKey, dollars]) => [urlKey, Math.round(dollars * 100)]),
  );
}

/** An agent's budget as Paperclip gave it, or null when its answer has none. */
function paperclipCents(agent: AgentRecord): number | null {
  const cents = agent.budgetMonthlyCents;
  return typeof cents === "number" && Number.isFinite(cents) ? cents : null;
}

function matchOf(
  workspace: number | null,
  paperclip: number | null,
  inPaperclip: boolean,
): BudgetMatch {
  if (!inPaperclip) return "not-in-paperclip";
  if (workspace === null) return "not-in-workspace";
  if (paperclip === null) return "unknown-in-paperclip";
  return workspace === paperclip ? "same" : "different";
}

/**
 * One row per agent Paperclip lists, then one per agent only the workspace
 * names, each group sorted by url key.
 *
 * @example
 * compareBudgets(new Map([["mateo", 5000]]), [{ id: "a", name: "Mateo", urlKey: "mateo", budgetMonthlyCents: 4000 }]);
 * // [{ urlKey: "mateo", name: "Mateo", workspaceCents: 5000, paperclipCents: 4000, match: "different" }]
 */
export function compareBudgets(
  workspace: ReadonlyMap<string, number>,
  agents: readonly AgentRecord[],
): BudgetRow[] {
  const byKey = (a: { urlKey: string }, b: { urlKey: string }) => a.urlKey.localeCompare(b.urlKey);
  const listed = [...agents].sort(byKey).map((agent): BudgetRow => {
    const want = workspace.get(agent.urlKey) ?? null;
    const have = paperclipCents(agent);
    return {
      urlKey: agent.urlKey,
      name: agent.name,
      workspaceCents: want,
      paperclipCents: have,
      match: matchOf(want, have, true),
    };
  });
  const known = new Set(agents.map((agent) => agent.urlKey));
  const missing = [...workspace]
    .filter(([urlKey]) => !known.has(urlKey))
    .map(([urlKey, cents]) => ({ urlKey, cents }))
    .sort(byKey)
    .map(
      ({ urlKey, cents }): BudgetRow => ({
        urlKey,
        name: null,
        workspaceCents: cents,
        paperclipCents: null,
        match: "not-in-paperclip",
      }),
    );
  return [...listed, ...missing];
}

/** Cents as dollars, such as `$12.50`, or `none`. */
function dollars(cents: number | null): string {
  return cents === null ? "none" : `$${(cents / 100).toFixed(2)}`;
}

const flags: Readonly<Record<BudgetMatch, string>> = {
  same: "",
  different: " (differs)",
  "not-in-workspace": " (not set in the workspace)",
  "not-in-paperclip": " (no such agent in Paperclip)",
  "unknown-in-paperclip": " (Paperclip gave no budget)",
};

/** One line of the report, such as `- Mateo (mateo): workspace $50.00, Paperclip $40.00 (differs)`. */
function rowLine(row: BudgetRow): string {
  const who = row.name === null ? row.urlKey : `${row.name} (${row.urlKey})`;
  const paperclip =
    row.match === "not-in-paperclip" ? "" : `, Paperclip ${dollars(row.paperclipCents)}`;
  return `- ${who}: workspace ${dollars(row.workspaceCents)}${paperclip}${flags[row.match]}`;
}

async function budgetsAnswer(call: ActionCall): Promise<ToolResult> {
  const agents = await listAgents(call);
  const rows = compareBudgets(workspaceBudgets(call.tool), agents.items);
  const differ = rows.filter((row) => row.match !== "same").length;
  return {
    content: [
      `Monthly budgets, workspace against Paperclip: ${rows.length} agents, ${differ} differ. This only reads: changing a budget needs the board's yes.`,
      ...(agents.limitNote === null ? [] : [agents.limitNote]),
      ...rows.map(rowLine),
    ].join("\n"),
    data: { agents: rows, differ, agentListCut: agents.limitNote !== null },
  };
}

/** Reports each agent's workspace and Paperclip budget. Reads the agent list only. */
export const budgetsHandler: ActionHandler = {
  // The agent list is `agents.read`, which every plugin holds (`runtimeCapabilities`).
  capabilities: ["agents.read"],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.budgets") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.budgets.` };
    }
    try {
      return await budgetsAnswer(call);
    } catch (error) {
      return {
        error: `${tool.name}: couldn't read the agents' budgets (${(error as Error).message}).`,
      };
    }
  },
};
