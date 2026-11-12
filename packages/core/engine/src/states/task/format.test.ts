import type { Agent, AgentMethod, Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

/** A made-up sorter whose own answer is a choice. */
const sorter: Agent = {
  ...writerAgent(),
  id: "sorter",
  name: "Sorter",
  output: { type: "choice", options: ["keep", "drop"] },
};

function workflowWith(step: WorkflowState): Workflow {
  return {
    version: 1,
    id: "sort",
    name: "Sort",
    initial: "sort",
    context: {},
    states: { sort: step, done: { type: "final", on: [] } },
    layout: {},
  };
}

const taskStep: WorkflowState = {
  type: "task",
  agent: "sorter",
  input: "Sort {{input.subject}}",
  output: "sorted",
  on: [{ to: "done", event: "done" }],
};

const itemStep: WorkflowState = {
  type: "foreach",
  agent: "sorter",
  items: "{{input.lines}}",
  output: "sorted",
  on: [{ to: "done", event: "done" }],
};

const start = {
  ...startInput("sha-1"),
  workflowId: "sort",
  input: { subject: "Invoice", lines: ["paper", "ink"], vendor: "Acme" },
};

verifies("engine.step-format", () => {
  it("reads a task step's answer as JSON when its format is json, whatever the agent's output", () => {
    const step = { ...taskStep, format: "json" as const };
    const reply = '```json\n{"keep": true}\n```';
    const { run } = play(workflowWith(step), [start, answer("call-1", reply)], { sorter });
    expect(run?.context["sorted"]).toEqual({ keep: true });
    expect(run?.status).toBe("completed");
  });

  it("keeps a task step's answer as it is when its format is text, though the agent answers a choice", () => {
    const step = { ...taskStep, format: "text" as const };
    const { run } = play(workflowWith(step), [start, answer("call-1", "Maybe later")], { sorter });
    expect(run?.context["sorted"]).toBe("Maybe later");
  });

  it("checks against the agent's own output when the step has no format", () => {
    const { log } = play(workflowWith(taskStep), [start, answer("call-1", "Maybe later")], {
      sorter,
    });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "answer-not-an-option" });
  });

  it("puts the step's format before the output of the method it calls", () => {
    const note: AgentMethod = { input: [], instructions: "Note it.", output: { ok: "boolean" } };
    const agents = { sorter: { ...sorter, methods: { note } } };
    const step = { ...taskStep, method: "note", with: {}, format: "text" as const };
    const { run } = play(workflowWith(step), [start, answer("call-1", "{not json")], agents);
    expect(run?.context["sorted"]).toBe("{not json");
  });

  it("reads each foreach item's answer in the step's format", () => {
    const step = { ...itemStep, format: "json" as const };
    const inputs = [start, answer("call-1", '{"n": 1}'), answer("call-2", '{"n": 2}')];
    const { run } = play(workflowWith(step), inputs, { sorter });
    expect(run?.context["sorted"]).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("fails the run when a foreach item's answer isn't the JSON the step's format asks for", () => {
    const step = { ...itemStep, format: "json" as const };
    const { log } = play(workflowWith(step), [start, answer("call-1", "paper is fine")], {
      sorter,
    });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", state: "sort" });
  });
});

verifies("engine.foreach-item-gets", () => {
  it("puts the picked data after the item when the state has no input", () => {
    const step = { ...itemStep, gets: ["input.vendor"] };
    const { decisions } = play(workflowWith(step), [start], { sorter });
    expect(decisions[0]?.effects[0]).toMatchObject({
      prompt: "paper\n\n## Data\n\n### input.vendor\nAcme",
    });
  });

  it("sends the item alone when the state picks no data", () => {
    const { decisions } = play(workflowWith(itemStep), [start], { sorter });
    expect(decisions[0]?.effects[0]).toMatchObject({ prompt: "paper" });
  });
});
