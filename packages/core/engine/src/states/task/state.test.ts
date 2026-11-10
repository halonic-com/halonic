import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput } from "../../kernel/decide-types.ts";
import { play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

const triage: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage a message",
  initial: "sort",
  context: {},
  states: {
    sort: { type: "task", agent: "triage", output: "kind", on: [{ to: "sorted", event: "done" }] },
    sorted: { type: "final", on: [] },
  },
  layout: {},
};

const start = { ...startInput("sha-1"), workflowId: "triage" };

function triageAgent(harness?: Agent["harness"]): Agent {
  return {
    ...writerAgent(harness),
    id: "triage",
    name: "Triage",
    output: { type: "choice", options: ["refund", "complaint", "question"] },
  };
}

const answer = (output: unknown, type: "model" | "harness" = "model"): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId: "call-1",
  result: { type, output },
});

const notAnOption =
  'Agent "triage" answered "This is a refund.", which isn\'t one of its options: ' +
  '"refund", "complaint", "question". ' +
  "Tighten the agent's instructions or use a larger model.";

verifies("engine.task-choice-answer", () => {
  it("finishes on an answer that is exactly one of the options", () => {
    const { decisions, run } = play(triage, [start, answer("refund")], { triage: triageAgent() });
    expect(decisions[1]?.events.slice(0, 3)).toEqual([
      { type: "agent.finished", state: "sort", agent: "triage", output: "refund" },
      { type: "context.updated", key: "kind", value: "refund" },
      { type: "transition", from: "sort", to: "sorted", event: "done" },
    ]);
    expect(run?.status).toBe("completed");
  });

  it("trims the whitespace around the answer and keeps the option itself", () => {
    const { decisions } = play(triage, [start, answer("  refund\n")], { triage: triageAgent() });
    expect(decisions[1]?.events.slice(0, 2)).toEqual([
      { type: "agent.finished", state: "sort", agent: "triage", output: "refund" },
      { type: "context.updated", key: "kind", value: "refund" },
    ]);
  });

  it("fails the run on an answer that isn't one of the options, and doesn't guess", () => {
    const agents = { triage: triageAgent() };
    const { decisions, run } = play(triage, [start, answer("This is a refund.")], agents);
    expect(decisions[1]?.events).toEqual([
      { type: "run.failed", state: "sort", error: notAnOption, reason: "answer-not-an-option" },
    ]);
    expect(decisions[1]?.effects).toEqual([]);
    expect(run?.status).toBe("failed");
    expect(run?.context).not.toHaveProperty("kind");
  });

  it.each([
    ["in another case", "Refund"],
    ["that isn't text", { kind: "refund" }],
  ])("fails the run on an answer %s", (_case, output) => {
    const { log } = play(triage, [start, answer(output)], { triage: triageAgent() });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "answer-not-an-option" });
  });

  it("checks a harness's result as it does a model's answer", () => {
    const agents = { triage: triageAgent("claude-code") };
    const matched = play(triage, [start, answer(" question ", "harness")], agents);
    expect(matched.log.at(-1)).toMatchObject({ type: "run.completed", state: "sorted" });
    expect(matched.run?.context).toEqual({ kind: "question" });

    const missed = play(triage, [start, answer("Refund", "harness")], agents);
    expect(missed.log.at(-1)).toMatchObject({
      type: "run.failed",
      state: "sort",
      reason: "answer-not-an-option",
    });
  });

  it("shortens a long answer in the error", () => {
    const long = "x".repeat(500);
    const { log } = play(triage, [start, answer(long)], { triage: triageAgent() });
    const failed = log.at(-1);
    expect(failed).toMatchObject({ type: "run.failed", reason: "answer-not-an-option" });
    expect(failed?.type === "run.failed" && failed.error).toContain(`"${"x".repeat(120)}…"`);
  });

  it("leaves the answer of an agent whose output isn't a choice as it is", () => {
    const { decisions } = play(triage, [start, answer("  This is a refund. ")], {
      triage: { ...triageAgent(), output: { type: "text" } },
    });
    expect(decisions[1]?.events[0]).toEqual({
      type: "agent.finished",
      state: "sort",
      agent: "triage",
      output: "  This is a refund. ",
    });
  });
});
