import type { Agent, AgentMethod, Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

/** The base parity fixture's `extract` method, made up for an `acme` clerk. */
const extract: AgentMethod = {
  description: "Pull the vendor and amount out of an invoice.",
  input: ["invoice"],
  instructions: "Extract the vendor and amount from: {{invoice}}",
  tools: [],
  model: "careful",
  maxSteps: 2,
  output: { vendor: "string", amount: "number", note: "string?" },
};

const clerk: Agent = {
  ...writerAgent(),
  id: "clerk",
  name: "Clerk",
  instructions: "Read the invoice.",
  methods: { extract },
};

function workflowWith(step: WorkflowState): Workflow {
  return {
    version: 1,
    id: "invoice",
    name: "Invoice",
    initial: "extract",
    context: {},
    states: { extract: step, done: { type: "final", on: [] } },
    layout: {},
  };
}

const methodStep: WorkflowState = {
  type: "task",
  agent: "clerk",
  method: "extract",
  with: { invoice: "{{input.invoice}}" },
  output: "fields",
  on: [{ to: "done", event: "done" }],
};

const start = {
  ...startInput("sha-1"),
  workflowId: "invoice",
  input: { invoice: "Acme Paper, 120 EUR", lines: ["paper", "ink"] },
};

const extractPrompt =
  'Method "extract": Pull the vendor and amount out of an invoice.\n\n' +
  "Extract the vendor and amount from: Acme Paper, 120 EUR\n\n" +
  "Answer with JSON with these fields: vendor (string), amount (number), note (string, may be left out).";

verifies("engine.task-method", () => {
  it("asks the agent with the method's prompt, not the run input", () => {
    const { decisions } = play(workflowWith(methodStep), [start], { clerk });
    const prompt = extractPrompt;
    expect(decisions[0]?.events).toContainEqual({
      type: "agent.started",
      state: "extract",
      agent: "clerk",
      prompt,
    });
    expect(decisions[0]?.effects).toEqual([
      { type: "call-model", callId: "call-1", state: "extract", agent: "clerk", prompt },
    ]);
  });

  it("puts the picked data after the method's prompt", () => {
    const step = { ...methodStep, gets: ["input.lines"] };
    const { decisions } = play(workflowWith(step), [start], { clerk });
    expect(decisions[0]?.effects[0]).toMatchObject({
      prompt: `${extractPrompt}\n\n## Data\n\n### input.lines\n[\n  "paper",\n  "ink"\n]`,
    });
  });

  it("reads the answer of a method with fields as JSON, though the agent answers text", () => {
    const reply = '```json\n{"vendor": "Acme Paper", "amount": 120}\n```';
    const { decisions, run } = play(workflowWith(methodStep), [start, answer("call-1", reply)], {
      clerk,
    });
    expect(decisions[1]?.events.slice(0, 2)).toEqual([
      {
        type: "agent.finished",
        state: "extract",
        agent: "clerk",
        output: { vendor: "Acme Paper", amount: 120 },
      },
      { type: "context.updated", key: "fields", value: { vendor: "Acme Paper", amount: 120 } },
    ]);
    expect(run?.status).toBe("completed");
  });

  it("fails the run on an answer to a method with fields that isn't JSON", () => {
    const { log } = play(workflowWith(methodStep), [start, answer("call-1", "Acme Paper")], {
      clerk,
    });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", state: "extract" });
  });

  it("keeps the text answer of a method that answers with text", () => {
    const note: AgentMethod = { input: [], instructions: "Write a note.", output: "text" };
    const agents = { clerk: { ...clerk, methods: { note } } };
    const step = { ...methodStep, method: "note", with: {} };
    const { decisions } = play(workflowWith(step), [start, answer("call-1", "{not json")], agents);
    expect(decisions[0]?.effects[0]).toMatchObject({ prompt: 'Method "note".\n\nWrite a note.' });
    expect(decisions[1]?.events[0]).toMatchObject({ type: "agent.finished", output: "{not json" });
  });

  it("fails the run when the agent has no such method, and calls no model", () => {
    const step = { ...methodStep, method: "summarize" };
    const { decisions, run } = play(workflowWith(step), [start], { clerk });
    expect(decisions[0]?.effects).toEqual([]);
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "run.failed",
      state: "extract",
      error: 'State "extract" calls method "summarize", which agent "clerk" doesn\'t have.',
      reason: "error",
    });
    expect(run?.status).toBe("failed");
  });
});

verifies("engine.foreach-item-method", () => {
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
  const check: AgentMethod = {
    input: ["line", "place"],
    instructions: "Check line {{place}}: {{line}}",
    output: { ok: "boolean" },
  };
  const agents = { clerk: { ...clerk, methods: { extract, check } } };

  it("asks each item's agent with the method's prompt for that item", () => {
    const { decisions } = play(workflowWith(itemStep), [start], agents);
    const prompts = decisions[0]?.effects.map((effect) =>
      "prompt" in effect ? effect.prompt : "",
    );
    const fields = "Answer with JSON with these fields: ok (boolean).";
    expect(prompts).toEqual([`Method "check".\n\nCheck line 0: paper\n\n${fields}`]);
  });

  it("reads each item's answer as the method's JSON", () => {
    const inputs = [start, answer("call-1", '{"ok": true}'), answer("call-2", '{"ok": false}')];
    const { run } = play(workflowWith(itemStep), inputs, agents);
    expect(run?.context["checks"]).toEqual([{ ok: true }, { ok: false }]);
  });

  it("fails the run before any item starts when the agent has no such method", () => {
    const step = { ...itemStep, method: "summarize" };
    const { decisions } = play(workflowWith(step), [start], agents);
    expect(decisions[0]?.effects).toEqual([]);
    expect(decisions[0]?.events.at(-1)).toMatchObject({
      type: "run.failed",
      error: 'State "extract" calls method "summarize", which agent "clerk" doesn\'t have.',
    });
  });
});
