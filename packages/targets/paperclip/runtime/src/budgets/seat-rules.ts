import type { Tool } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { AgentRecord, ToolResult } from "../host.ts";
import { listAgents } from "./list-limit.ts";

/**
 * The `paperclip.seat-rules` action (plan HAL-17960, PR 1, read-only): each
 * agent's seat rule as the workspace states it, by the agent's name in
 * Paperclip. The seats plugin is the authority and no other plugin can read
 * its rules today (HAL-18962), so this lists the workspace's rules only and
 * says so; the comparison comes once the seats plugin offers a read.
 */

/** A seat rule's kind, as the workspace's tool file gives it. */
export type SeatRuleKind = "shared" | "pinned" | "own-seat";

/** One agent's row in the report. */
export interface SeatRuleRow {
  readonly urlKey: string;
  /** The agent's name in Paperclip; null when Paperclip has no agent with this url key. */
  readonly name: string | null;
  readonly seat: SeatRuleKind;
  readonly paidApiNever: boolean;
}

/** What the tool file's settings say for one agent, after the format's defaults. */
interface StatedRule {
  readonly seat: SeatRuleKind;
  readonly paidApi?: "never";
}

/** The workspace's seat rules from the tool's settings, by url key. */
function workspaceRules(tool: Tool): Record<string, StatedRule> {
  const settings = tool.action.with;
  return "agents" in settings ? (settings.agents as Record<string, StatedRule>) : {};
}

/**
 * One row per agent the workspace names, sorted by url key, with its name
 * from Paperclip's list.
 *
 * @example
 * seatRuleRows({ mateo: { seat: "pinned" } }, [{ id: "a", name: "Mateo", urlKey: "mateo" }]);
 * // [{ urlKey: "mateo", name: "Mateo", seat: "pinned", paidApiNever: false }]
 */
export function seatRuleRows(
  rules: Readonly<Record<string, StatedRule>>,
  agents: readonly AgentRecord[],
): SeatRuleRow[] {
  const names = new Map(agents.map((agent) => [agent.urlKey, agent.name]));
  return Object.entries(rules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([urlKey, rule]) => ({
      urlKey,
      name: names.get(urlKey) ?? null,
      seat: rule.seat,
      paidApiNever: rule.paidApi === "never",
    }));
}

const seatWords: Readonly<Record<SeatRuleKind, string>> = {
  shared: "shared seats",
  pinned: "pinned (never moved)",
  "own-seat": "a seat of its own",
};

/** One line of the report, such as `- Mateo (mateo): pinned (never moved), paid API never`. */
function rowLine(row: SeatRuleRow): string {
  const who = row.name === null ? row.urlKey : `${row.name} (${row.urlKey})`;
  const paid = row.paidApiNever ? ", paid API never" : "";
  const missing = row.name === null ? " (no such agent in Paperclip)" : "";
  return `- ${who}: ${seatWords[row.seat]}${paid}${missing}`;
}

async function seatRulesAnswer(call: ActionCall): Promise<ToolResult> {
  const agents = await listAgents(call);
  const rows = seatRuleRows(workspaceRules(call.tool), agents.items);
  return {
    content: [
      `Seat rules as the workspace states them: ${rows.length} agents. The seats plugin's own rules can't be read yet, so this doesn't compare them; which seat an agent gets stays with the board. This only reads.`,
      ...(agents.limitNote === null ? [] : [agents.limitNote]),
      ...rows.map(rowLine),
    ].join("\n"),
    data: { agents: rows, agentListCut: agents.limitNote !== null },
  };
}

/** Reports the workspace's seat rules by agent. Reads the agent list only. */
export const seatRulesHandler: ActionHandler = {
  // The agent list is `agents.read`, which every plugin holds (`runtimeCapabilities`).
  capabilities: ["agents.read"],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.seat-rules") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.seat-rules.` };
    }
    try {
      return await seatRulesAnswer(call);
    } catch (error) {
      return {
        error: `${tool.name}: couldn't read the agents for the seat rules (${(error as Error).message}).`,
      };
    }
  },
};
