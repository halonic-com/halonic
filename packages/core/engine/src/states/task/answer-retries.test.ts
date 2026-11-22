import { answerNotAnOptionCause } from "@halonicjs/events";
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
    sort: {
      type: "task",
      agent: "triage",
      input: "Sort the message.",
      output: "kind",
      conversation: "turns",
      on: [{ to: "sorted", event: "done" }],
    },
    sorted: { type: "final", on: [] },
  },
  layout: {},
};

const start = { ...startInput("sha-1"), workflowId: "triage" };

const options = ["refund", "complaint", "question"];

function triageAgent(answerRetries?: number, harness?: Agent["harness"]): Agent {
  return {
    ...writerAgent(harness),
    id: "triage",
    name: "Triage",
    output: { type: "choice", options },
    ...(answerRetries === undefined ? {} : { answerRetries }),
  };
}

const answer = (
  callId: string,
  output: unknown,
  type: "model" | "harness" = "model",
): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId,
  result: { type, output },
});

const notAnOption =
  'The agent triage answered "This is a refund.", which isn\'t one of its options ' +
  "(refund, complaint, question).";

const retryPrompt =
  `Sort the message.\n\nYour answer can't be used: ${notAnOption} ` +
  "Answer again with only what your output asks for.";

verifies("engine.task-answer-retries", () => {
  it("asks the agent once more after an answer that isn't an option, then finishes", () => {
    const agents = { triage: triageAgent(1) };
    const first = play(triage, [start, answer("call-1", "This is a refund.")], agents);
    expect(first.decisions[1]?.events).toEqual([
      {
        type: "agent.answer-retried",
        state: "sort",
        agent: "triage",
        reason: "answer-not-an-option",
        cause: answerNotAnOptionCause({ agent: "triage", options }),
        error: `${notAnOption} Tighten the agent's instructions or use a larger model.`,
        attempt: 1,
        prompt: retryPrompt,
      },
    ]);
    expect(first.decisions[1]?.effects).toEqual([
      { type: "call-model", callId: "call-2", state: "sort", agent: "triage", prompt: retryPrompt },
    ]);
    expect(first.run?.status).toBe("running");

    const inputs = [start, answer("call-1", "This is a refund."), answer("call-2", "refund")];
    const { run } = play(triage, inputs, agents);
    expect(run?.status).toBe("completed");
    expect(run?.context["kind"]).toBe("refund");
    // The conversation keeps the step's own prompt, not the one that asked again.
    expect(run?.context["turns"]).toEqual([
      { role: "user", content: "Sort the message." },
      { role: "assistant", content: "refund" },
    ]);
  });

  it("fails the run as it does today when the second answer is unusable too", () => {
    const agents = { triage: triageAgent(1) };
    const inputs = [start, answer("call-1", "This is a refund."), answer("call-2", "Refund")];
    const { log, run } = play(triage, inputs, agents);
    const today = play(triage, [start, answer("call-1", "Refund")], { triage: triageAgent() });
    expect(log.at(-1)).toEqual({ ...today.log.at(-1), seq: log.length });
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      reason: "answer-not-an-option",
      cause: answerNotAnOptionCause({ agent: "triage", options }),
    });
    expect(log.filter((event) => event.type === "agent.answer-retried")).toHaveLength(1);
    expect(run?.status).toBe("failed");
  });

  it("asks a harness agent again in a new harness call, after no answer to a json output", () => {
    const agents = {
      triage: { ...triageAgent(1, "claude-code"), output: { type: "json" as const } },
    };
    const { decisions, run } = play(triage, [start, answer("call-1", null, "harness")], agents);
    expect(decisions[1]?.events[0]).toMatchObject({
      type: "agent.answer-retried",
      reason: "error",
      cause: { kind: "invalid_input", code: "answer.not-json", detail: { agent: "triage" } },
      attempt: 1,
    });
    expect(decisions[1]?.effects).toEqual([
      expect.objectContaining({ type: "run-harness", callId: "call-2", harness: "claude-code" }),
    ]);
    expect(decisions[1]?.effects[0]).toHaveProperty(
      "prompt",
      expect.stringMatching(/^Sort the message\.\n\nYour answer can't be used: Agent "triage"/),
    );
    expect(run?.status).toBe("running");
  });

  it("ignores a result for the first call that comes after the retry", () => {
    const agents = { triage: triageAgent(1) };
    const inputs = [start, answer("call-1", "This is a refund."), answer("call-1", "refund")];
    const { decisions, run } = play(triage, inputs, agents);
    expect(decisions[2]?.events).toEqual([]);
    expect(run?.pendingCall?.callId).toBe("call-2");
  });

  it.each([
    ["left out", undefined],
    ["0", 0],
  ])("fails the run at once when answerRetries is %s", (_case, retries) => {
    const agents = { triage: triageAgent(retries) };
    const { log } = play(triage, [start, answer("call-1", "Refund")], agents);
    expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "answer-not-an-option" });
    expect(log.some((event) => event.type === "agent.answer-retried")).toBe(false);
  });
});
