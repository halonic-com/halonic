import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

const checker = { ...writerAgent(), id: "checker", name: "Checker" };

function itemStep(keys: Partial<WorkflowState>): WorkflowState {
  return {
    type: "foreach",
    agent: "checker",
    items: "{{input.lines}}",
    as: "line",
    output: "checks",
    on: [{ to: "done", event: "done" }],
    ...keys,
  };
}

function workflowWith(step: WorkflowState): Workflow {
  return {
    version: 1,
    id: "batch",
    name: "Batch",
    initial: "lines",
    context: {},
    states: { lines: step, done: { type: "final", on: [] } },
    layout: {},
  };
}

const start = {
  ...startInput("sha-1"),
  workflowId: "batch",
  input: { vendor: "Acme Paper", lines: ["paper", "ink"] },
};

function prompts(step: WorkflowState): string[] {
  const { decisions } = play(workflowWith(step), [start], { checker });
  return (decisions[0]?.effects ?? []).map((effect) => ("prompt" in effect ? effect.prompt : ""));
}

verifies("engine.step-format", () => {
  it("reads each item's answer as JSON when the state's format is json", () => {
    const inputs = [start, answer("call-1", '{"ok": true}'), answer("call-2", '{"ok": false}')];
    const { run } = play(workflowWith(itemStep({ format: "json" })), inputs, { checker });
    expect(run?.context["checks"]).toEqual([{ ok: true }, { ok: false }]);
  });

  it("fails the run when an item's answer isn't the JSON the state's format asks for", () => {
    const inputs = [start, answer("call-1", "Looks fine.")];
    const { run } = play(workflowWith(itemStep({ format: "json" })), inputs, { checker });
    expect(run?.status).toBe("failed");
  });
});

verifies("engine.foreach-item-gets", () => {
  it("sends the item with the picked data after it when the state has no input", () => {
    expect(prompts(itemStep({ gets: ["input.vendor"] }))[0]).toBe(
      "paper\n\n## Data\n\n### input.vendor\nAcme Paper",
    );
  });

  it("sends the picked data after the state's input", () => {
    const step = itemStep({ input: "Check {{line}}", gets: ["input.vendor"] });
    expect(prompts(step)[0]).toBe("Check paper\n\n## Data\n\n### input.vendor\nAcme Paper");
  });
});
