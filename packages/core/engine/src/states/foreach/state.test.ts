import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput, StartInput } from "../../kernel/decide-types.ts";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";
import { callOf } from "../../kernel/run-state.ts";

const emails = [{ subject: "Refund" }, { subject: "Invoice" }, { subject: "Hello" }];

/** Labels each email of the run's input, two at a time, then ends; `leave` drops keys of the state. */
function triageWorkflow(
  triage: Partial<WorkflowState> = {},
  leave: readonly (keyof WorkflowState)[] = [],
): Workflow {
  const state: WorkflowState = {
    type: "foreach",
    agent: "labeler",
    items: "{{input.emails}}",
    as: "email",
    concurrency: 2,
    input: "Label {{email.subject}} ({{index}})",
    output: "labels",
    on: [{ to: "filed", event: "done" }],
    ...triage,
  };
  for (const key of leave) delete state[key];
  return {
    version: 1,
    id: "triage",
    name: "Triage the inbox",
    initial: "triage",
    context: {},
    states: {
      triage: state,
      filed: { type: "final", on: [] },
    },
    layout: {},
  };
}

const start: StartInput = {
  ...startInput("sha-1"),
  workflowId: "triage",
  input: { emails, subject: "Inbox" },
};

const bodies = (log: ReturnType<typeof play>["log"], from: number) =>
  log.slice(from).map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

verifies("engine.foreach-state", () => {
  it("starts the first items up to its concurrency, each with its item and index", () => {
    const { log, decisions, run } = play(triageWorkflow(), [start]);
    expect(bodies(log, 2)).toEqual([
      {
        type: "agent.started",
        state: "triage",
        agent: "labeler",
        prompt: "Label Refund (0)",
        item: 0,
      },
      {
        type: "agent.started",
        state: "triage",
        agent: "labeler",
        prompt: "Label Invoice (1)",
        item: 1,
      },
    ]);
    expect(decisions[0]?.effects).toEqual([
      {
        type: "call-model",
        callId: "call-1",
        state: "triage",
        agent: "labeler",
        prompt: "Label Refund (0)",
      },
      {
        type: "call-model",
        callId: "call-2",
        state: "triage",
        agent: "labeler",
        prompt: "Label Invoice (1)",
      },
    ]);
    expect(run?.foreach).toMatchObject({ state: "triage", started: 2, results: [] });
    expect(run && callOf(run, "call-2")).toMatchObject({
      agent: "labeler",
      prompt: "Label Invoice (1)",
    });
  });

  it("starts the next item as one ends, and keeps the results in item order", () => {
    const { log, decisions, run } = play(triageWorkflow(), [
      start,
      answer("call-2", "billing"),
      answer("call-1", "refunds"),
      answer("call-3", "other"),
    ]);
    expect(decisions[1]?.effects).toEqual([
      {
        type: "call-model",
        callId: "call-3",
        state: "triage",
        agent: "labeler",
        prompt: "Label Hello (2)",
      },
    ]);
    expect(decisions[2]?.effects).toEqual([]);
    expect(bodies(log, log.length - 5)).toEqual([
      { type: "agent.finished", state: "triage", agent: "labeler", output: "other", item: 2 },
      { type: "context.updated", key: "labels", value: ["refunds", "billing", "other"] },
      { type: "transition", from: "triage", to: "filed", event: "done" },
      { type: "state.entered", state: "filed" },
      {
        type: "run.completed",
        state: "filed",
        context: { labels: ["refunds", "billing", "other"] },
      },
    ]);
    expect(run).toMatchObject({ status: "completed", foreach: null });
  });

  it("runs one item at a time by default, and gives an item with no input as text or JSON", () => {
    const workflow = triageWorkflow({}, ["concurrency", "input", "as"]);
    const { decisions } = play(workflow, [start, answer("call-1", "refunds")]);
    expect(decisions[0]?.effects).toMatchObject([
      { callId: "call-1", prompt: '{"subject":"Refund"}' },
    ]);
    expect(decisions[1]?.effects).toMatchObject([
      { callId: "call-2", prompt: '{"subject":"Invoice"}' },
    ]);

    const texts = play(workflow, [{ ...start, input: { emails: ["Refund", "Invoice"] } }]);
    expect(texts.decisions[0]?.effects).toMatchObject([{ prompt: "Refund" }]);
  });

  it("writes an empty list and moves on done when there are no items", () => {
    const { log } = play(triageWorkflow(), [{ ...start, input: { emails: [] } }]);
    expect(bodies(log, 2).slice(0, 2)).toEqual([
      { type: "context.updated", key: "labels", value: [] },
      { type: "transition", from: "triage", to: "filed", event: "done" },
    ]);
  });

  it("changes nothing for the result of a call it doesn't wait on", () => {
    const { decisions } = play(triageWorkflow(), [
      start,
      answer("call-1", "refunds"),
      answer("call-1", "again"),
    ]);
    expect(decisions[2]).toEqual({ events: [], effects: [] });
  });

  it("fails the run with the reason of an item's failed call", () => {
    const failed: DecideInput = {
      type: "effect-failed",
      at: start.at,
      callId: "call-2",
      error: "No model answered.",
      reason: "model-unreachable",
    };
    const { log, run } = play(triageWorkflow(), [start, failed]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      state: "triage",
      reason: "model-unreachable",
    });
    expect(run).toMatchObject({ status: "failed", foreach: null });
  });

  it("fails the run when an item's agent stops for an approval", () => {
    const stopped: DecideInput = {
      type: "effect-done",
      at: start.at,
      callId: "call-1",
      result: {
        type: "approval",
        tool: "send_mail",
        args: {},
        resume: { messages: [], calls: [], step: 1 },
      },
    };
    const { log } = play(triageWorkflow(), [start, stopped]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'Agent "labeler" stopped for an approval of "send_mail" in item 0 of for-each state "triage"; an item\'s agent can\'t wait for one.',
    });
  });

  it("fails the run when an item's agent stops before a connector call that can change things", () => {
    const stopped: DecideInput = {
      type: "effect-done",
      at: start.at,
      callId: "call-1",
      result: {
        type: "effect",
        connector: "mail",
        tool: "send_mail",
        args: {},
        resume: { messages: [], calls: [], step: 1 },
      },
    };
    const { log, run } = play(triageWorkflow(), [start, stopped]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'Agent "labeler" stopped before a call to tool "send_mail" that can change things in item 0 of for-each state "triage"; an item\'s agent can\'t make one.',
    });
    expect(run).toMatchObject({ status: "failed", foreach: null, effect: null });
  });

  it.each([
    ["names no items", triageWorkflow({}, ["items"]), 'For-each state "triage" names no items.'],
    [
      "has items that aren't a list",
      triageWorkflow({ items: "{{input.subject}}" }),
      'The items of for-each state "triage" ("{{input.subject}}") give a text, not a list.',
    ],
    [
      "names no agent or workflow",
      triageWorkflow({}, ["agent"]),
      'For-each state "triage" names no agent or workflow.',
    ],
  ])("fails the run when the state %s", (_name, workflow, error) => {
    const { log } = play(workflow, [start]);
    expect(log.at(-1)).toMatchObject({ type: "run.failed", state: "triage", error });
  });
});

/** The `labeler` agent, whose output is a `choice` of `refunds` and `billing`. */
const labelAgents = {
  labeler: {
    ...writerAgent(),
    id: "labeler",
    output: { type: "choice" as const, options: ["refunds", "billing"] },
  },
};

verifies("engine.task-choice-answer", () => {
  it("gives an item the option its agent answered, with the whitespace trimmed", () => {
    const { decisions } = play(
      triageWorkflow(),
      [start, answer("call-1", " refunds\n")],
      labelAgents,
    );
    expect(decisions[1]?.events[0]).toEqual({
      type: "agent.finished",
      state: "triage",
      agent: "labeler",
      output: "refunds",
      item: 0,
    });
  });

  it("fails the run when an item's agent answers none of its options", () => {
    const { decisions, run } = play(
      triageWorkflow(),
      [start, answer("call-2", "Refunds")],
      labelAgents,
    );
    expect(decisions[1]?.events).toEqual([
      {
        type: "run.failed",
        state: "triage",
        error:
          'Item 1 of for-each state "triage" failed: Agent "labeler" answered "Refunds", ' +
          'which isn\'t one of its options: "refunds", "billing". ' +
          "Tighten the agent's instructions or use a larger model.",
        reason: "answer-not-an-option",
      },
    ]);
    expect(run).toMatchObject({ status: "failed", foreach: null });
  });
});
