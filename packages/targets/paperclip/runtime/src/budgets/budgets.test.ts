import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost } from "../fake-host.test-helper.ts";
import { runtimeHandlers } from "../handlers.ts";
import type { AgentRecord, ProjectRecord, ToolDeclaration } from "../host.ts";
import { registerWorkspaceTools } from "../register.ts";
import { compareBudgets, compareProjectBudgets } from "./budgets.ts";
import { LIST_LIMIT } from "./list-limit.ts";

const declarations: ToolDeclaration[] = [
  {
    name: "budgets",
    displayName: "Budgets",
    description: "Acme's budgets.",
    parametersSchema: { type: "object", properties: {} },
  },
];

/** Acme's agents in Paperclip: Mateo's budget is off from the workspace's on purpose. */
const paperclipAgents: AgentRecord[] = [
  { id: "agent-ravi", name: "Ravi", urlKey: "ravi", budgetMonthlyCents: 3000 },
  { id: "agent-mateo", name: "Mateo", urlKey: "mateo", budgetMonthlyCents: 4000 },
  { id: "agent-nina", name: "Nina", urlKey: "nina", budgetMonthlyCents: 2000 },
];

/** Acme's projects in Paperclip: the website's budget is off from the workspace's on purpose. */
const paperclipProjects: ProjectRecord[] = [
  {
    id: "project-website",
    name: "Website",
    urlKey: "website",
    budget: { amountCents: 6000, windowKind: "calendar_month_utc" },
  },
  { id: "project-docs", name: "Docs", urlKey: "docs", budget: null },
];

/** `LIST_LIMIT` projects, as a full page of Paperclip's project list. */
const fullProjectPage: ProjectRecord[] = Array.from({ length: LIST_LIMIT }, (_, i) => ({
  id: `project-${i}`,
  name: `Project ${i}`,
  urlKey: `project-${i}`,
}));

/**
 * A worker serving `budgets` with the workspace's budgets in dollars, and
 * these agents and projects in Paperclip.
 */
function worker(
  agents: Record<string, number>,
  listed: () => Promise<readonly AgentRecord[]>,
  { projects = {}, listedProjects = async () => [] as ProjectRecord[] } = {} as {
    projects?: Record<string, number>;
    listedProjects?: () => Promise<readonly ProjectRecord[]>;
  },
) {
  const host = fakeHost({}, {});
  Object.assign((host.ctx as unknown as { agents: object }).agents, { list: listed });
  Object.assign((host.ctx as unknown as { projects: object }).projects, { list: listedProjects });
  const budgets = acmeTool("budgets", {
    action: { run: "paperclip.budgets", with: { agents, projects } },
  });
  registerWorkspaceTools(host.ctx, {
    declarations,
    builtIn: acmeSnapshot({ tools: [budgets] }),
    handlers: runtimeHandlers,
  });
  return host;
}

verifies("runtime.paperclip-budgets", () => {
  describe("paperclip.budgets", () => {
    test("lists every agent with both budgets and flags the known mismatch", async () => {
      const { call, writes } = worker(
        { mateo: 50, ravi: 30, tomas: 10 },
        async () => paperclipAgents,
      );
      const result = await call("budgets", {});
      expect(result.content?.split("\n")).toEqual([
        "Monthly budgets, workspace against Paperclip: 4 agents and 0 projects, 3 differ. This only reads: changing a budget needs the board's yes.",
        "Agents:",
        "- Mateo (mateo): workspace $50.00, Paperclip $40.00 (differs)",
        "- Nina (nina): workspace none, Paperclip $20.00 (not set in the workspace)",
        "- Ravi (ravi): workspace $30.00, Paperclip $30.00",
        "- tomas: workspace $10.00 (no such agent in Paperclip)",
        "Projects:",
      ]);
      expect(result.data).toMatchObject({ differ: 3 });
      expect(writes).toEqual([]);
    });

    test("compares in whole cents, so 12.5 dollars matches 1250 cents", () => {
      const rows = compareBudgets(new Map([["mateo", 1250]]), [
        { id: "a", name: "Mateo", urlKey: "mateo", budgetMonthlyCents: 1250 },
      ]);
      expect(rows.map((row) => row.match)).toEqual(["same"]);
    });

    test("says so when Paperclip gives an agent no budget", () => {
      const rows = compareBudgets(new Map([["mateo", 1000]]), [
        { id: "a", name: "Mateo", urlKey: "mateo" },
      ]);
      expect(rows).toEqual([
        {
          urlKey: "mateo",
          name: "Mateo",
          workspaceCents: 1000,
          paperclipCents: null,
          match: "unknown-in-paperclip",
        },
      ]);
    });

    test("answers with an error when Paperclip's agent list fails", async () => {
      const { call } = worker({ mateo: 50 }, async () => {
        throw new Error("Paperclip is down");
      });
      expect(await call("budgets", {})).toEqual({
        error: "budgets: couldn't read the budgets (Paperclip is down).",
      });
    });

    test("asks Paperclip only for agents.read and projects.read, to list the two", () => {
      expect(runtimeHandlers["paperclip.budgets"]?.capabilities).toEqual([
        "agents.read",
        "projects.read",
      ]);
    });
  });

  describe("paperclip.budgets for projects", () => {
    test("lists every project with both budgets and flags the differences", async () => {
      const { call, writes } = worker({ ravi: 30 }, async () => paperclipAgents.slice(0, 1), {
        projects: { website: 80, phase: 20 },
        listedProjects: async () => paperclipProjects,
      });
      const result = await call("budgets", {});
      expect(result.content?.split("\n")).toEqual([
        "Monthly budgets, workspace against Paperclip: 1 agents and 3 projects, 3 differ. This only reads: changing a budget needs the board's yes.",
        "Agents:",
        "- Ravi (ravi): workspace $30.00, Paperclip $30.00",
        "Projects:",
        "- Docs (docs): workspace none, Paperclip none (not set in the workspace)",
        "- Website (website): workspace $80.00, Paperclip $60.00 (differs)",
        "- phase: workspace $20.00 (no such project in Paperclip)",
      ]);
      expect(result.data).toMatchObject({ differ: 3, projectListCut: false });
      expect(writes).toEqual([]);
    });

    test("flags a project whose Paperclip budget isn't monthly instead of comparing it", () => {
      const rows = compareProjectBudgets(new Map([["website", 6000]]), [
        {
          id: "p",
          name: "Website",
          urlKey: "website",
          budget: { amountCents: 6000, windowKind: "lifetime" },
        },
      ]);
      expect(rows).toEqual([
        {
          urlKey: "website",
          name: "Website",
          workspaceCents: 6000,
          paperclipCents: null,
          match: "not-monthly-in-paperclip",
        },
      ]);
    });

    test("says so under the projects heading when the project list came back full", async () => {
      const { call } = worker({}, async () => [], {
        listedProjects: async () => fullProjectPage,
      });
      const lines = (await call("budgets", {})).content?.split("\n") ?? [];
      const heading = lines.indexOf("Projects:");
      expect(lines[heading + 1]).toBe(
        `Note: Paperclip's project list stops at ${LIST_LIMIT} projects and returned ${LIST_LIMIT}, so any after those are missing here.`,
      );
      expect(lines.filter((line) => line.startsWith("Note:"))).toHaveLength(1);
    });

    test("has no project note when the project list is under the limit", async () => {
      const { call } = worker({}, async () => [], {
        listedProjects: async () => paperclipProjects,
      });
      const result = await call("budgets", {});
      expect(result.content).not.toContain("Note:");
      expect(result.data).toMatchObject({ projectListCut: false });
    });

    test("answers with an error when Paperclip's project list fails", async () => {
      const { call } = worker({}, async () => [], {
        listedProjects: async () => {
          throw new Error("Paperclip is down");
        },
      });
      expect(await call("budgets", {})).toEqual({
        error: "budgets: couldn't read the budgets (Paperclip is down).",
      });
    });
  });
});
