import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost, pinnedCommit } from "../fake-host.test-helper.ts";
import { runtimeHandlers } from "../handlers.ts";
import type { AgentRecord, ApprovalRecord, ProjectRecord, ToolDeclaration } from "../host.ts";
import { registerWorkspaceTools } from "../register.ts";
import { BUDGET_APPROVAL_TYPE, toolFile } from "./propose-budget.ts";

const declarations: ToolDeclaration[] = [
  {
    name: "propose_budget",
    displayName: "Propose budget",
    description: "Acme's budget proposals.",
    parametersSchema: { type: "object", properties: {} },
  },
];

/** Acme's agents in Paperclip: Mateo's and Nina's budgets are off from the workspace's on purpose. */
const paperclipAgents: AgentRecord[] = [
  { id: "agent-mateo", name: "Mateo", urlKey: "mateo", budgetMonthlyCents: 4000 },
  { id: "agent-nina", name: "Nina", urlKey: "nina" },
  { id: "agent-ravi", name: "Ravi", urlKey: "ravi", budgetMonthlyCents: 3000 },
];

/** Acme's projects in Paperclip: the website's budget is off from the workspace's on purpose. */
const paperclipProjects: ProjectRecord[] = [
  {
    id: "project-website",
    name: "Website",
    urlKey: "website",
    budget: { amountCents: 6000, windowKind: "calendar_month_utc" },
  },
];

/** A pending budget approval for one agent or project, as Paperclip lists it. */
function pendingApproval(id: string, scopeType: string, scopeId: string): ApprovalRecord {
  return {
    id,
    type: BUDGET_APPROVAL_TYPE,
    status: "pending",
    payload: { scopeType, scopeId, scopeName: scopeId, budgetAmount: 4000 },
  };
}

/** What the worker's Paperclip holds and what the tool file sets. */
interface Setup {
  readonly mode?: "dry-run" | "write";
  readonly approvals?: () => Promise<readonly ApprovalRecord[]>;
}

/**
 * A worker serving `propose_budget` with Mateo at $50, Nina at $25, Ravi at
 * $30 and the website at $80 in the workspace, and the agents and projects
 * above in Paperclip. Records each approval list it is asked for.
 */
function worker({ mode, approvals = async () => [] }: Setup = {}) {
  const host = fakeHost({}, {});
  const asked: unknown[] = [];
  const ctx = host.ctx as unknown as Record<string, object>;
  Object.assign(ctx["agents"] ?? {}, { list: async () => paperclipAgents });
  Object.assign(ctx["projects"] ?? {}, { list: async () => paperclipProjects });
  Object.assign(ctx["approvals"] ?? {}, {
    list: async (input: unknown) => {
      asked.push(input);
      return approvals();
    },
  });
  const settings = { agents: { mateo: 50, nina: 25, ravi: 30 }, projects: { website: 80 } };
  const tool = acmeTool("propose_budget", {
    action: {
      run: "paperclip.propose-budget",
      with: mode === undefined ? settings : { ...settings, mode },
    },
  } as never);
  registerWorkspaceTools(host.ctx, {
    declarations,
    builtIn: acmeSnapshot({ tools: [tool] }),
    handlers: runtimeHandlers,
  });
  return { ...host, asked };
}

const source = `library/tools/propose-budget.tool.yaml at commit ${pinnedCommit}`;

verifies("runtime.paperclip-propose-budget", () => {
  describe("paperclip.propose-budget", () => {
    test("answers as a dry run by default and files nothing", async () => {
      const { call, writes } = worker();
      const result = await call("propose_budget", {});
      expect(result.content?.split("\n")[0]).toBe(
        "Dry run: nothing was filed; turning on writing is the board's step.",
      );
      expect(result.data).toMatchObject({ mode: "dry-run" });
      expect(writes).toEqual([]);
    });

    test("names the source file, its commit and the old and new amounts of each proposal", async () => {
      const { call } = worker();
      const result = await call("propose_budget", {});
      expect(result.content?.split("\n").slice(1)).toEqual([
        `Would ask the board for 3 budget approvals, each a monthly budget from ${source}:`,
        "- agent Mateo (mateo): $40.00 to $50.00",
        "- agent Nina (nina): none to $25.00",
        "- project Website (website): $60.00 to $80.00",
      ]);
      expect((result.data as { proposals: unknown[] }).proposals[0]).toEqual({
        scope: "agent",
        id: "agent-mateo",
        urlKey: "mateo",
        name: "Mateo",
        oldCents: 4000,
        newCents: 5000,
        source: { file: "library/tools/propose-budget.tool.yaml", commit: pinnedCommit },
      });
    });

    test("reports a budget with a pending budget approval and proposes nothing more for it", async () => {
      const { call, asked } = worker({
        approvals: async () => [
          pendingApproval("approval-1", "agent", "agent-mateo"),
          pendingApproval("approval-2", "project", "project-website"),
        ],
      });
      const result = await call("propose_budget", {});
      expect(result.content?.split("\n").slice(1)).toEqual([
        `Would ask the board for 1 budget approvals, each a monthly budget from ${source}:`,
        "- agent Nina (nina): none to $25.00",
        "- agent Mateo (mateo): budget approval approval-1 is already pending, so nothing more is proposed",
        "- project Website (website): budget approval approval-2 is already pending, so nothing more is proposed",
      ]);
      expect(asked).toEqual([{ companyId: "acme", status: "pending" }]);
    });

    test("doesn't count an approval of another type, another status or another agent as a duplicate", async () => {
      const other = pendingApproval("approval-3", "agent", "agent-mateo");
      const { call } = worker({
        approvals: async () => [
          { ...other, type: "hire_agent" },
          { ...other, status: "approved" },
          pendingApproval("approval-4", "agent", "agent-ravi"),
          { ...other, payload: {} },
        ],
      });
      const data = (await call("propose_budget", {})).data as { proposals: { urlKey: string }[] };
      expect(data.proposals.map((proposal) => proposal.urlKey)).toEqual([
        "mateo",
        "nina",
        "website",
      ]);
    });

    test("files nothing in write mode either, and says Paperclip can't file it yet", async () => {
      const { call, writes } = worker({ mode: "write" });
      const result = await call("propose_budget", {});
      expect(result.content?.split("\n")[0]).toBe(
        "Not filed: Paperclip doesn't let a plugin file a budget approval yet (HAL-20033), so this answers as a dry run.",
      );
      expect(result.data).toMatchObject({ mode: "dry-run" });
      expect(writes).toEqual([]);
    });

    test("proposes nothing when it can't read the pending approvals", async () => {
      const { call } = worker({
        approvals: async () => {
          throw new Error("this plugin may not read approvals");
        },
      });
      expect(await call("propose_budget", {})).toEqual({
        error:
          "propose_budget: couldn't read the budgets or the pending approvals, so it proposes nothing (this plugin may not read approvals).",
      });
    });

    test("asks Paperclip only to read agents, projects and approvals", () => {
      expect(runtimeHandlers["paperclip.propose-budget"]?.capabilities).toEqual([
        "agents.read",
        "projects.read",
        "approvals.read",
      ]);
    });

    test("names a tool's file as the format places it", () => {
      expect(toolFile("budgets")).toBe("library/tools/budgets.tool.yaml");
    });
  });
});
