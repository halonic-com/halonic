import type { Tool } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { AgentRecord, ProjectRecord, ToolResult } from "../host.ts";
import { listAgents, listProjects } from "./list-limit.ts";

/**
 * The `paperclip.budgets` action (plan HAL-17450, step 5, read-only): each
 * agent's and each project's monthly budget as the workspace's tool file
 * sets it beside the one Paperclip has, with every difference flagged. It
 * only reads: a budget is money, so changing one stays with the board.
 */

/** How one agent's or project's two budgets compare. */
export type BudgetMatch =
  | "same"
  | "different"
  | "not-in-workspace"
  | "not-in-paperclip"
  | "unknown-in-paperclip"
  | "not-monthly-in-paperclip";

/** One agent's or project's row in the report. Amounts are in cents; null where that side has none. */
export interface BudgetRow {
  readonly urlKey: string;
  /** Its name in Paperclip; null when Paperclip has nothing with this url key. */
  readonly name: string | null;
  readonly workspaceCents: number | null;
  readonly paperclipCents: number | null;
  readonly match: BudgetMatch;
}

/**
 * What Paperclip says about one agent or project: its monthly budget in
 * cents, `null` when it gives none, or `not-monthly` when its budget runs
 * over another window and so can't be compared with a monthly one.
 */
type PaperclipBudget = number | null | "not-monthly";

/** One agent or project as Paperclip lists it, cut down to what the comparison reads. */
interface Listed {
  readonly urlKey: string;
  readonly name: string;
  readonly budget: PaperclipBudget;
}

/** The workspace's budgets from one of the tool's settings, in cents by url key. */
function workspaceBudgets(tool: Tool, setting: "agents" | "projects"): Map<string, number> {
  const settings = tool.action.with;
  const budgets =
    setting in settings
      ? (settings[setting as keyof typeof settings] as Record<string, number>)
      : {};
  return new Map(
    Object.entries(budgets).map(([urlKey, dollars]) => [urlKey, Math.round(dollars * 100)]),
  );
}

/** A number Paperclip gave as cents, or null when it isn't one. */
function centsOrNull(cents: unknown): number | null {
  return typeof cents === "number" && Number.isFinite(cents) ? cents : null;
}

/** An agent as the comparison reads it: Paperclip keeps agents' budgets monthly. */
function listedAgent(agent: AgentRecord): Listed {
  return { urlKey: agent.urlKey, name: agent.name, budget: centsOrNull(agent.budgetMonthlyCents) };
}

/** A project as the comparison reads it: only a `calendar_month_utc` budget is monthly. */
function listedProject(project: ProjectRecord): Listed {
  const budget = project.budget;
  if (budget === undefined || budget === null) {
    return { urlKey: project.urlKey, name: project.name, budget: null };
  }
  const monthly = budget.windowKind === "calendar_month_utc";
  return {
    urlKey: project.urlKey,
    name: project.name,
    budget: monthly ? centsOrNull(budget.amountCents) : "not-monthly",
  };
}

function matchOf(workspace: number | null, paperclip: PaperclipBudget): BudgetMatch {
  if (workspace === null) return "not-in-workspace";
  if (paperclip === null) return "unknown-in-paperclip";
  if (paperclip === "not-monthly") return "not-monthly-in-paperclip";
  return workspace === paperclip ? "same" : "different";
}

/**
 * One row per item Paperclip lists, then one per url key only the workspace
 * names, each group sorted by url key.
 */
function compareListed(
  workspace: ReadonlyMap<string, number>,
  listed: readonly Listed[],
): BudgetRow[] {
  const byKey = (a: { urlKey: string }, b: { urlKey: string }) => a.urlKey.localeCompare(b.urlKey);
  const inPaperclip = [...listed].sort(byKey).map((item): BudgetRow => {
    const want = workspace.get(item.urlKey) ?? null;
    return {
      urlKey: item.urlKey,
      name: item.name,
      workspaceCents: want,
      paperclipCents: typeof item.budget === "number" ? item.budget : null,
      match: matchOf(want, item.budget),
    };
  });
  const known = new Set(listed.map((item) => item.urlKey));
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
  return [...inPaperclip, ...missing];
}

/**
 * The agents' rows: one per agent Paperclip lists, then one per agent only
 * the workspace names.
 *
 * @example
 * compareBudgets(new Map([["mateo", 5000]]), [{ id: "a", name: "Mateo", urlKey: "mateo", budgetMonthlyCents: 4000 }]);
 * // [{ urlKey: "mateo", name: "Mateo", workspaceCents: 5000, paperclipCents: 4000, match: "different" }]
 */
export function compareBudgets(
  workspace: ReadonlyMap<string, number>,
  agents: readonly AgentRecord[],
): BudgetRow[] {
  return compareListed(workspace, agents.map(listedAgent));
}

/**
 * The projects' rows, as `compareBudgets` gives the agents'. A project whose
 * budget isn't monthly is flagged rather than compared.
 *
 * @example
 * compareProjectBudgets(new Map([["website", 8000]]), [{ id: "p", name: "Website", urlKey: "website", budget: { amountCents: 8000, windowKind: "calendar_month_utc" } }]);
 * // [{ urlKey: "website", name: "Website", workspaceCents: 8000, paperclipCents: 8000, match: "same" }]
 */
export function compareProjectBudgets(
  workspace: ReadonlyMap<string, number>,
  projects: readonly ProjectRecord[],
): BudgetRow[] {
  return compareListed(workspace, projects.map(listedProject));
}

/** Cents as dollars, such as `$12.50`, or `none`. */
function dollars(cents: number | null): string {
  return cents === null ? "none" : `$${(cents / 100).toFixed(2)}`;
}

/** The flag after a row, by what it is: an agent or a project. */
function flagOf(match: BudgetMatch, what: "agent" | "project"): string {
  const flags: Readonly<Record<BudgetMatch, string>> = {
    same: "",
    different: " (differs)",
    "not-in-workspace": " (not set in the workspace)",
    "not-in-paperclip": ` (no such ${what} in Paperclip)`,
    "unknown-in-paperclip": " (Paperclip gave no budget)",
    "not-monthly-in-paperclip": " (Paperclip's budget isn't monthly, so it isn't compared)",
  };
  return flags[match];
}

/** One line of the report, such as `- Mateo (mateo): workspace $50.00, Paperclip $40.00 (differs)`. */
function rowLine(row: BudgetRow, what: "agent" | "project"): string {
  const who = row.name === null ? row.urlKey : `${row.name} (${row.urlKey})`;
  const paperclip =
    row.match === "not-in-paperclip" ? "" : `, Paperclip ${dollars(row.paperclipCents)}`;
  return `- ${who}: workspace ${dollars(row.workspaceCents)}${paperclip}${flagOf(row.match, what)}`;
}

/** One section of the report: its heading, the 500-limit note when its list reached it, and its rows. */
function section(
  heading: string,
  limitNote: string | null,
  rows: readonly BudgetRow[],
  what: "agent" | "project",
): string[] {
  return [
    heading,
    ...(limitNote === null ? [] : [limitNote]),
    ...rows.map((row) => rowLine(row, what)),
  ];
}

async function budgetsAnswer(call: ActionCall): Promise<ToolResult> {
  const [agents, projects] = await Promise.all([listAgents(call), listProjects(call)]);
  const agentRows = compareBudgets(workspaceBudgets(call.tool, "agents"), agents.items);
  const projectRows = compareProjectBudgets(
    workspaceBudgets(call.tool, "projects"),
    projects.items,
  );
  const differ = [...agentRows, ...projectRows].filter((row) => row.match !== "same").length;
  return {
    content: [
      `Monthly budgets, workspace against Paperclip: ${agentRows.length} agents and ${projectRows.length} projects, ${differ} differ. This only reads: changing a budget needs the board's yes.`,
      ...section("Agents:", agents.limitNote, agentRows, "agent"),
      ...section("Projects:", projects.limitNote, projectRows, "project"),
    ].join("\n"),
    data: {
      agents: agentRows,
      projects: projectRows,
      differ,
      agentListCut: agents.limitNote !== null,
      projectListCut: projects.limitNote !== null,
    },
  };
}

/** Reports each agent's and project's workspace and Paperclip budget. Reads the two lists only. */
export const budgetsHandler: ActionHandler = {
  // The agent list is `agents.read`, which every plugin holds (`runtimeCapabilities`).
  // `projects.read` is for the project list only, read-only (approved on HAL-18967).
  capabilities: ["agents.read", "projects.read"],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.budgets") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.budgets.` };
    }
    try {
      return await budgetsAnswer(call);
    } catch (error) {
      return {
        error: `${tool.name}: couldn't read the budgets (${(error as Error).message}).`,
      };
    }
  },
};
