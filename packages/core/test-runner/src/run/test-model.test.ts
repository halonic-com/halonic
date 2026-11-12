import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

/** The checker answers whether a line is fine. */
const checkWorkflow = `id: check
name: Check
initial: check
states:
  check: { type: task, agent: checker, input: "Check {{input.line}}", output: result, on: [{ to: done }] }
  done: { type: final }
`;

const checkTests = testFile(
  "check",
  `workflow: check
cases:
  - name: the line is fine
    input: { line: paper }
    mocks: { checker: ['{"ok": true}'] }
    expect: { final: done }
`,
);

const models = {
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "models.yaml": `aliases:
  default:
    provider: mock
    model: echo
    price: { input: 0.1, output: 0.4 }
  fast:
    provider: mock
    model: echo-fast
    price: { input: 0.05, output: 0.2 }
    fallback: [default]
`,
};

/** One model call event of a case's run, with only what these tests check. */
interface ModelCall {
  readonly type: "llm.request" | "llm.response";
  readonly model: string;
  readonly usage?: { inputTokens: number; outputTokens: number };
  readonly cost?: number | undefined;
}

/** The case's model calls: each request's and response's model, and the response's usage and cost. */
async function modelCalls(...parts: Record<string, string>[]): Promise<ModelCall[]> {
  const input = await testInput(workflow("check", checkWorkflow), checkTests, ...parts);
  const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;
  expect(test?.failures).toEqual([]);
  const events: readonly RunEvent[] = test?.runs[0]?.events ?? [];
  return events.flatMap((event): ModelCall[] => {
    if (event.type === "llm.request") return [{ type: event.type, model: event.model }];
    if (event.type === "llm.response") {
      return [{ type: event.type, model: event.model, usage: event.usage, cost: event.cost }];
    }
    return [];
  });
}

verifies("test-runner.test-model", () => {
  describe("a case's model calls", () => {
    it("log the agent's model and cost from its alias's price", async () => {
      const calls = await modelCalls(models, agent("checker", "model: fast\n"));

      const [request, response] = calls;
      expect(request).toEqual({ type: "llm.request", model: "echo-fast" });
      expect(response).toMatchObject({ type: "llm.response", model: "echo-fast" });
      const usage = response?.usage ?? { inputTokens: 0, outputTokens: 0 };
      expect(usage.outputTokens).toBe(3);
      expect(response?.cost).toBeCloseTo(
        (usage.inputTokens * 0.05 + usage.outputTokens * 0.2) / 1_000_000,
        12,
      );
    });

    it("use the default model for an agent without one", async () => {
      const calls = await modelCalls(models, agent("checker"));

      expect(calls.map((call) => call.model)).toEqual(["echo", "echo"]);
      expect(calls[1]?.cost).toBeGreaterThan(0);
    });

    it("log the model test, unpriced, when the hub has no such alias", async () => {
      const calls = await modelCalls(agent("checker"));

      expect(calls).toMatchObject([
        { type: "llm.request", model: "test" },
        { type: "llm.response", model: "test", cost: 0 },
      ]);
    });
  });
});
