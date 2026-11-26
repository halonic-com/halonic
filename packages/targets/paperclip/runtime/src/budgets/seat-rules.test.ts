import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost } from "../fake-host.test-helper.ts";
import { runtimeHandlers } from "../handlers.ts";
import type { AgentRecord, ToolDeclaration } from "../host.ts";
import { registerWorkspaceTools } from "../register.ts";
import { LIST_LIMIT } from "./list-limit.ts";

const declarations: ToolDeclaration[] = ["seat_rules", "budgets"].map((name) => ({
  name,
  displayName: name,
  description: `Acme's ${name}.`,
  parametersSchema: { type: "object", properties: {} },
}));

/** One agent's seat rule as the tool file states it. */
type SeatRule = { seat: "shared" | "pinned" | "own-seat"; paidApi?: "never" };

const paperclipAgents: AgentRecord[] = [
  { id: "agent-ravi", name: "Ravi", urlKey: "ravi" },
  { id: "agent-mateo", name: "Mateo", urlKey: "mateo" },
];

/** `limit` agents, as a full page of Paperclip's agent list. */
const fullPage: AgentRecord[] = Array.from({ length: LIST_LIMIT }, (_, i) => ({
  id: `agent-${i}`,
  name: `Agent ${i}`,
  urlKey: `agent-${i}`,
  budgetMonthlyCents: 1000,
}));

/** A worker serving `seat_rules` and `budgets` with these settings, and these agents in Paperclip. */
function worker(
  settings: { seats?: Record<string, SeatRule>; budgets?: Record<string, number> },
  agents: readonly AgentRecord[],
) {
  const host = fakeHost({}, {});
  Object.assign((host.ctx as unknown as { agents: object }).agents, { list: async () => agents });
  const tools = [
    acmeTool("seat_rules", {
      action: { run: "paperclip.seat-rules", with: { agents: settings.seats ?? {} } },
    }),
    acmeTool("budgets", {
      action: { run: "paperclip.budgets", with: { agents: settings.budgets ?? {}, projects: {} } },
    }),
  ];
  registerWorkspaceTools(host.ctx, {
    declarations,
    builtIn: acmeSnapshot({ tools }),
    handlers: runtimeHandlers,
  });
  return host;
}

/** A seat-rules tool file whose `agents` setting is `agents`, in YAML flow style. */
function seatRulesFile(agents: string): string {
  return [
    "id: seat-rules",
    "name: seat_rules",
    "description: The workspace's seat rules.",
    "callers: everyone",
    "action:",
    "  run: paperclip.seat-rules",
    `  with: { agents: ${agents} }`,
    "",
  ].join("\n");
}

/** The problems of a tool file that must fail, as "path: message". */
function refusals(text: string): string[] {
  const parsed = parseFile("tool", text, {});
  if (parsed.ok) expect.fail("expected the seat rules to be refused");
  return parsed.error.map((problem) => `${problem.path.join(".")}: ${problem.message}`);
}

verifies("runtime.paperclip-seat-rules", () => {
  describe("paperclip.seat-rules", () => {
    test("lists the workspace's rules by agent, and says it can't compare them yet", async () => {
      const { call, writes } = worker(
        {
          seats: {
            ravi: { seat: "shared" },
            mateo: { seat: "pinned", paidApi: "never" },
            tomas: { seat: "own-seat" },
          },
        },
        paperclipAgents,
      );
      const result = await call("seat_rules", {});
      expect(result.content?.split("\n")).toEqual([
        "Seat rules as the workspace states them: 3 agents. The seats plugin's own rules can't be read yet, so this doesn't compare them; which seat an agent gets stays with the board. This only reads.",
        "- Mateo (mateo): pinned (never moved), paid API never",
        "- Ravi (ravi): shared seats",
        "- tomas: a seat of its own (no such agent in Paperclip)",
      ]);
      expect(writes).toEqual([]);
    });

    test("reads only the rule kinds, with shared as the default", () => {
      const parsed = parseFile("tool", seatRulesFile("{ mateo: { paidApi: never } }"), {});
      expect(parsed.ok && parsed.value.value.action.with).toEqual({
        agents: { mateo: { seat: "shared", paidApi: "never" } },
      });
    });

    test("refuses a seat name, an email or a connection id with a clear error", () => {
      const kindsOnly =
        "write only the kind of rule: shared, pinned, own-seat. Seat names, emails and connection ids stay in the seats plugin's board-only settings";
      expect(refusals(seatRulesFile("{ mateo: { seat: max-seat-2 } }"))).toEqual([
        `action.with.agents.mateo.seat: ${kindsOnly}`,
      ]);
      expect(refusals(seatRulesFile("{ mateo: { seat: 'ops@acme.example' } }"))).toEqual([
        `action.with.agents.mateo.seat: ${kindsOnly}`,
      ]);
      expect(refusals(seatRulesFile("{ mateo: { seat: conn_8f2a91 } }"))).toEqual([
        `action.with.agents.mateo.seat: ${kindsOnly}`,
      ]);
      expect(
        refusals(seatRulesFile("{ mateo: { seat: pinned, connection: conn_8f2a91 } }")),
      ).toHaveLength(1);
      expect(refusals(seatRulesFile("{ 'ops@acme.example': { seat: pinned } }"))).toHaveLength(1);
      expect(refusals(seatRulesFile("{ mateo: { paidApi: allowed } }"))).toEqual([
        "action.with.agents.mateo.paidApi: write 'never', or leave paidApi out",
      ]);
    });

    test("asks Paperclip only for agents.read", () => {
      expect(runtimeHandlers["paperclip.seat-rules"]?.capabilities).toEqual(["agents.read"]);
    });
  });

  describe("the 500-limit note", () => {
    const note = `Note: Paperclip's agent list stops at ${LIST_LIMIT} agents and returned ${LIST_LIMIT}, so any after those are missing here.`;

    test("the seat rules say so when the agent list came back full", async () => {
      const { call } = worker({ seats: { "agent-0": { seat: "pinned" } } }, fullPage);
      const result = await call("seat_rules", {});
      expect(result.content?.split("\n")[1]).toBe(note);
      expect(result.data).toMatchObject({ agentListCut: true });
    });

    test("the budgets say so when the agent list came back full", async () => {
      const { call } = worker({ budgets: { "agent-0": 10 } }, fullPage);
      const result = await call("budgets", {});
      // Right under the agents' heading, which follows the summary line.
      expect(result.content?.split("\n").slice(1, 3)).toEqual(["Agents:", note]);
      expect(result.data).toMatchObject({ agentListCut: true });
    });

    test("neither report has the note when the list is under the limit", async () => {
      const { call } = worker(
        { seats: { mateo: { seat: "pinned" } }, budgets: { mateo: 10 } },
        paperclipAgents,
      );
      for (const tool of ["seat_rules", "budgets"]) {
        const result = await call(tool, {});
        expect(result.content).not.toContain("Note:");
        expect(result.data).toMatchObject({ agentListCut: false });
      }
    });
  });
});
