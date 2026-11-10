import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryTurnLog, runTestTurn } from "../../agent/turn-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../../testing/scripted-model.ts";
import {
  type DelegatedTask,
  delegateToolName,
  type SubagentToolsOptions,
  subagentTools,
} from "./subagent-tools.ts";

const hubAgents = {
  reviewer: { id: "reviewer", name: "Reviewer", subagents: ["checker"] },
  checker: {
    id: "checker",
    name: "Checker",
    description: "Checks invoice totals",
    subagents: ["reviewer"],
  },
};

function options(overrides: Partial<SubagentToolsOptions> = {}): SubagentToolsOptions {
  return {
    agent: hubAgents.reviewer,
    hubAgents,
    depth: 0,
    state: "review",
    runSubagent: async () => "Totals add up",
    ...overrides,
  };
}

verifies("engine.subagent-tools", () => {
  describe("subagentTools", () => {
    it("offers one delegate tool per subagent of the hub, never the agent itself", () => {
      const agent = { id: "reviewer", subagents: ["checker", "reviewer", "ghost"] };

      const tools = subagentTools(options({ agent }));

      expect(tools.map((tool) => tool.definition)).toEqual([
        {
          name: "delegate_checker",
          description:
            'Hand a task to the "Checker" agent: Checks invoice totals. Returns its answer.',
          parameters: {
            type: "object",
            properties: {
              task: {
                type: "string",
                description: "What the agent should do, with all the context it needs.",
              },
            },
            required: ["task"],
          },
        },
      ]);
    });

    it("leaves out a subagent whose id is only an inherited object key", () => {
      const agent = { id: "reviewer", subagents: ["constructor", "toString", "checker"] };

      const tools = subagentTools(options({ agent }));

      expect(tools.map((tool) => tool.definition.name)).toEqual(["delegate_checker"]);
    });

    it("hands the task over, logs the subagent's start and end, and answers with its answer", async () => {
      const log = new MemoryTurnLog();
      const tasks: DelegatedTask[] = [];
      const tools = subagentTools(
        options({
          log,
          depth: 1,
          runSubagent: async (task) => {
            tasks.push(task);
            return "Totals add up";
          },
        }),
      );

      const { result } = await runTestTurn({
        answers: [
          callAnswer(call("c1", "delegate_checker", { task: "Check INV-7" })),
          textAnswer("Checked"),
        ],
        halonicTools: tools,
        log,
      });

      expect(tasks).toEqual([
        { agent: "checker", task: "Check INV-7", parent: "reviewer", depth: 2 },
      ]);
      expect(result.turn[1]).toMatchObject({ role: "tool", content: "Totals add up" });
      expect(log.events.filter((event) => event.type.startsWith("agent."))).toEqual([
        {
          type: "agent.started",
          state: "review",
          agent: "checker",
          parent: "reviewer",
          prompt: "Check INV-7",
        },
        {
          type: "agent.finished",
          state: "review",
          agent: "checker",
          parent: "reviewer",
          output: "Totals add up",
        },
      ]);
    });

    it("fails with the subagent's error and leaves its agent.started open", async () => {
      const log = new MemoryTurnLog();
      const [tool] = subagentTools(
        options({
          log,
          runSubagent: async () => {
            throw new Error("checker has no model");
          },
        }),
      );

      await expect(tool?.run({ task: "Check INV-7" })).rejects.toThrow("checker has no model");
      expect(log.events.map((event) => event.type)).toEqual(["agent.started"]);
    });

    it("answers with JSON when the subagent's answer isn't text", async () => {
      const [tool] = subagentTools(options({ runSubagent: async () => ({ ok: true }) }));

      expect(await tool?.run({ task: "Check INV-7" })).toBe('{"ok":true}');
    });

    it.each([[{}], [{ task: "  " }], [{ task: 7 }]])(
      "refuses %j without running the subagent",
      async (args) => {
        const tasks: DelegatedTask[] = [];
        const [tool] = subagentTools(options({ runSubagent: async (task) => tasks.push(task) }));

        await expect(tool?.run(args)).rejects.toThrow('"task" is required');
        expect(tasks).toEqual([]);
      },
    );

    it("ends a loop of agents that delegate to each other at the depth limit", async () => {
      const depths: number[] = [];
      const delegateAll = async (
        agentId: "reviewer" | "checker",
        depth: number,
      ): Promise<string> => {
        depths.push(depth);
        const tools = subagentTools(
          options({
            agent: hubAgents[agentId],
            depth,
            runSubagent: (task) => delegateAll(task.agent as "reviewer" | "checker", task.depth),
          }),
        );
        const [tool] = tools;
        return tool === undefined ? `${agentId} at ${depth}` : tool.run({ task: "Go on" });
      };

      expect(await delegateAll("reviewer", 0)).toBe("checker at 3");
      expect(depths).toEqual([0, 1, 2, 3]);
      expect(subagentTools(options({ depth: 1, maxDepth: 1 }))).toEqual([]);
    });
  });

  describe("delegateToolName", () => {
    it("keeps the characters a tool name allows, and at most 64 of them", () => {
      expect(delegateToolName("tax.checker v2")).toBe("delegate_tax_checker_v2");
      expect(delegateToolName("a".repeat(80))).toHaveLength(64);
    });
  });
});
