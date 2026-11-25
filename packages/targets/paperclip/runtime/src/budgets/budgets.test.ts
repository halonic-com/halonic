import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost } from "../fake-host.test-helper.ts";
import { runtimeHandlers } from "../handlers.ts";
import type { AgentRecord, ToolDeclaration } from "../host.ts";
import { registerWorkspaceTools } from "../register.ts";
import { compareBudgets } from "./budgets.ts";

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

/** A worker serving `budgets` with the workspace's budgets in dollars, and these agents in Paperclip. */
function worker(agents: Record<string, number>, listed: () => Promise<readonly AgentRecord[]>) {
  const host = fakeHost({}, {});
  Object.assign((host.ctx as unknown as { agents: object }).agents, { list: listed });
  const budgets = acmeTool("budgets", { action: { run: "paperclip.budgets", with: { agents } } });
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
        "Monthly budgets, workspace against Paperclip: 4 agents, 3 differ. This only reads: changing a budget needs the board's yes.",
        "- Mateo (mateo): workspace $50.00, Paperclip $40.00 (differs)",
        "- Nina (nina): workspace none, Paperclip $20.00 (not set in the workspace)",
        "- Ravi (ravi): workspace $30.00, Paperclip $30.00",
        "- tomas: workspace $10.00 (no such agent in Paperclip)",
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
        error: "budgets: couldn't read the agents' budgets (Paperclip is down).",
      });
    });

    test("asks Paperclip for no capability beyond the runtime's own", () => {
      expect(runtimeHandlers["paperclip.budgets"]?.capabilities).toEqual([]);
    });
  });
});
