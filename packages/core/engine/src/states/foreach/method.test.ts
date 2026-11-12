import type { Agent, AgentMethod, Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

const check: AgentMethod = {
  input: ["line", "place"],
  instructions: "Check line {{place}}: {{line}}",
  output: { ok: "boolean" },
};

const clerk: Agent = {
  ...writerAgent(),
  id: "clerk",
  name: "Clerk",
  instructions: "Read the invoice.",
  methods: { check },
};

const itemStep: WorkflowState = {
  type: "foreach",
  agent: "clerk",
  items: "{{input.lines}}",
  as: "line",
  method: "check",
  with: { line: "{{line}}", place: "{{index}}" },
  output: "checks",
  on: [{ to: "done", event: "done" }],
};

function workflowWith(step: WorkflowState): Workflow {
  return {
    version: 1,
    id: "invoice",
    name: "Invoice",
    initial: "lines",
    context: {},
    states: { lines: step, done: { type: "final", on: [] } },
    layout: {},
  };
}

const start = { ...startInput("sha-1"), workflowId: "invoice", input: { lines: ["paper", "ink"] } };

verifies("engine.foreach-item-method", () => {
  it("asks each item's agent with the method's prompt for that item", () => {
    const { decisions } = play(workflowWith(itemStep), [start], { clerk });
    const prompts = decisions[0]?.effects.map((effect) =>
      "prompt" in effect ? effect.prompt : "",
    );
    const fields = "Answer with JSON with these fields: ok (boolean).";
    expect(prompts).toEqual([`Method "check".\n\nCheck line 0: paper\n\n${fields}`]);
  });

  it("reads each item's answer as the method's JSON", () => {
    const inputs = [start, answer("call-1", '{"ok": true}'), answer("call-2", '{"ok": false}')];
    const { run } = play(workflowWith(itemStep), inputs, { clerk });
    expect(run?.context["checks"]).toEqual([{ ok: true }, { ok: false }]);
  });

  it("fails the run before any item starts when the agent has no such method", () => {
    const step = { ...itemStep, method: "summarize" };
    const { decisions } = play(workflowWith(step), [start], { clerk });
    expect(decisions[0]?.effects).toEqual([]);
    expect(decisions[0]?.events.at(-1)).toMatchObject({
      type: "run.failed",
      error: 'State "lines" calls method "summarize", which agent "clerk" doesn\'t have.',
    });
  });
});
