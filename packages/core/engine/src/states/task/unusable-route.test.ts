import { answerNotAnOptionCause } from "@halonicjs/events";
import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput } from "../../kernel/decide-types.ts";
import { play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

const routed: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage a message",
  initial: "sort",
  context: {},
  states: {
    sort: {
      type: "task",
      agent: "triage",
      input: "Sort the message.",
      output: "kind",
      on: [
        { to: "full", event: "unusable" },
        { to: "sorted", event: "done" },
      ],
    },
    sorted: { type: "final", on: [] },
    full: { type: "final", on: [] },
  },
  layout: {},
};

const start = { ...startInput("sha-1"), workflowId: "triage" };

const options = ["refund", "complaint", "question"];

function triageAgent(answerRetries?: number): Agent {
  return {
    ...writerAgent(),
    id: "triage",
    name: "Triage",
    output: { type: "choice", options },
    ...(answerRetries === undefined ? {} : { answerRetries }),
  };
}

const answer = (callId: string, output: unknown): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId,
  result: { type: "model", output },
});

const transitions = (log: readonly { type: string }[]) =>
  log.filter((event) => event.type === "transition");

verifies("engine.task-unusable-route", () => {
  it("takes the unusable transition when the retry's answer can't be used either", () => {
    const agents = { triage: triageAgent(1) };
    const inputs = [start, answer("call-1", "Refund"), answer("call-2", "Refund")];
    const { decisions, log, run } = play(routed, inputs, agents);
    expect(log.filter((event) => event.type === "agent.answer-retried")).toHaveLength(1);
    expect(decisions[2]?.events[0]).toEqual({
      type: "agent.finished",
      state: "sort",
      agent: "triage",
      output: null,
      error:
        'The agent triage answered "Refund", which isn\'t one of its options (refund, complaint, question). ' +
        "Tighten the agent's instructions or use a larger model.",
      reason: "answer-not-an-option",
      cause: answerNotAnOptionCause({ agent: "triage", options }),
    });
    expect(transitions(log)).toMatchObject([{ from: "sort", to: "full", event: "unusable" }]);
    expect(run?.status).toBe("completed");
    expect(run?.context).not.toHaveProperty("kind");
  });

  it("takes it at the first unusable answer when the agent has no retries", () => {
    const { log } = play(routed, [start, answer("call-1", "Refund")], { triage: triageAgent() });
    expect(log.some((event) => event.type === "agent.answer-retried")).toBe(false);
    expect(transitions(log)).toMatchObject([{ to: "full", event: "unusable" }]);
  });

  it("takes it when a json output gets no answer at all", () => {
    const agents = { triage: { ...triageAgent(), output: { type: "json" as const } } };
    const { log } = play(routed, [start, answer("call-1", null)], agents);
    expect(log.find((event) => event.type === "agent.finished")).toMatchObject({
      output: null,
      reason: "error",
      cause: { code: "answer.not-json" },
    });
    expect(transitions(log)).toMatchObject([{ to: "full", event: "unusable" }]);
  });

  it("looks for the JSON in a json answer first, even when the agent has no retries", () => {
    const agents = { triage: { ...triageAgent(), output: { type: "json" as const } } };
    const text = 'Sorted: {"kind": "refund"}, as asked.';
    const { log, run } = play(routed, [start, answer("call-1", text)], agents);
    expect(transitions(log)).toMatchObject([{ to: "sorted", event: "done" }]);
    expect(run?.context["kind"]).toEqual({ kind: "refund" });
  });

  it("ends with done when the answer is usable", () => {
    const { log, run } = play(routed, [start, answer("call-1", "refund")], {
      triage: triageAgent(),
    });
    expect(transitions(log)).toMatchObject([{ to: "sorted", event: "done" }]);
    expect(run?.context["kind"]).toBe("refund");
  });

  it("fails the run as before without an unusable transition", () => {
    const sortState = { ...routed.states["sort"], on: [{ to: "sorted", event: "done" }] };
    const workflow = { ...routed, states: { ...routed.states, sort: sortState } } as Workflow;
    const { log } = play(workflow, [start, answer("call-1", "Refund")], { triage: triageAgent() });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "answer-not-an-option" });
  });
});
