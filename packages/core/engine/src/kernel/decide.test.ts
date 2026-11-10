import type { Workflow, WorkflowState } from "@halonicjs/format";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { states } from "../generated/states.ts";
import { decide } from "./decide.ts";
import type { DecideInput, StartInput } from "./decide-types.ts";
import { InputRefused } from "./input-refused.ts";
import { play, writerAgent } from "./kernel-test-kit.test-helper.ts";
import type { StateHandler, StateRegistry } from "./registry.ts";
import { evolve, type RunState } from "./run-state.ts";

function task(fields: Partial<WorkflowState> = {}): WorkflowState {
  return { type: "task", agent: "writer", on: [], ...fields };
}

const reply: Workflow = {
  version: 1,
  id: "reply",
  name: "Reply to a customer",
  initial: "draft",
  context: { tone: "friendly" },
  states: {
    draft: task({
      input: "Reply to {{input.from}}",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    }),
    sent: { type: "final", on: [] },
  },
  layout: {},
};

const startInput: StartInput = {
  type: "start",
  at: "2026-11-09T09:00:00.000Z",
  runId: "r-acme",
  hubId: "acme",
  workflowId: "reply",
  input: { from: "support" },
  kind: "run",
  definitionsVersion: "sha-1",
};

const answer = (callId: string, output: unknown): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId,
  result: { type: "model", output },
});

verifies("engine.task-state", () => {
  it("starts the agent with the state's prompt and asks for one model call", () => {
    const { decisions } = play(reply, [startInput]);
    expect(decisions[0]?.events).toEqual([
      {
        type: "run.started",
        hubId: "acme",
        workflowId: "reply",
        input: { from: "support" },
        kind: "run",
        definitionsVersion: "sha-1",
      },
      { type: "state.entered", state: "draft" },
      { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply to support" },
    ]);
    expect(decisions[0]?.effects).toEqual([
      {
        type: "call-model",
        callId: "call-1",
        state: "draft",
        agent: "writer",
        prompt: "Reply to support",
      },
    ]);
  });

  it("finishes on the answer, writes the output and takes the done transition", () => {
    const { decisions } = play(reply, [startInput, answer("call-1", "On its way")]);
    expect(decisions[1]?.events.slice(0, 4)).toEqual([
      { type: "agent.finished", state: "draft", agent: "writer", output: "On its way" },
      { type: "context.updated", key: "reply", value: "On its way" },
      { type: "transition", from: "draft", to: "sent", event: "done" },
      { type: "state.entered", state: "sent" },
    ]);
  });

  it("ignores an answer to any other call", () => {
    const { decisions } = play(reply, [startInput, answer("call-9", "Stale")]);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });

  it("sends only the picked data for a step with gets and no input (HAL-4455)", () => {
    const picks: Workflow = {
      ...reply,
      states: { ...reply.states, draft: task({ gets: ["input.from"], on: [] }) },
    };
    const withSecret = { ...startInput, input: { from: "support", secret: "not sent" } };
    const { decisions } = play(picks, [withSecret]);
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "agent.started",
      state: "draft",
      agent: "writer",
      prompt: "## Data\n\n### input.from\nsupport",
    });
  });

  it("takes the first done transition whose guard passes", () => {
    const routed: Workflow = {
      ...reply,
      states: {
        ...reply.states,
        draft: task({
          output: "reply",
          on: [
            { to: "escalate", event: "done", when: { equals: ["{{context.reply}}", "?"] } },
            { to: "sent", event: "done" },
          ],
        }),
        escalate: { type: "final", on: [] },
      },
    };
    const { log } = play(routed, [startInput, answer("call-1", "?")]);
    expect(log.at(-1)).toMatchObject({ type: "run.completed", state: "escalate" });
  });

  it("fails the run when no done transition matches", () => {
    const deadEnd: Workflow = { ...reply, states: { ...reply.states, draft: task() } };
    const { log, run } = play(deadEnd, [startInput, answer("call-1", "ok")]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      state: "draft",
      error: 'State "draft" has no transition for "done".',
      reason: "error",
    });
    expect(run?.status).toBe("failed");
  });

  it("fails the run when the task names no agent", () => {
    const noAgent: Workflow = {
      ...reply,
      states: { ...reply.states, draft: { type: "task", on: [] } },
    };
    const { log } = play(noAgent, [startInput]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error: 'Task state "draft" names no agent.',
    });
  });
});

verifies("engine.task-state-harness", () => {
  const harnessAnswer = (callId: string, output: unknown): DecideInput => ({
    type: "effect-done",
    at: "2026-11-09T09:00:05.000Z",
    callId,
    result: { type: "harness", output },
  });

  it("asks for a harness run instead of a model call when the agent's file names one", () => {
    const { decisions } = play(reply, [startInput], { writer: writerAgent("claude-code") });
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "agent.started",
      state: "draft",
      agent: "writer",
      prompt: "Reply to support",
    });
    expect(decisions[0]?.effects).toEqual([
      {
        type: "run-harness",
        callId: "call-1",
        state: "draft",
        agent: "writer",
        harness: "claude-code",
        prompt: "Reply to support",
      },
    ]);
  });

  it("finishes on the harness's result as it does on a model's answer", () => {
    const agents = { writer: writerAgent("codex") };
    const { decisions } = play(reply, [startInput, harnessAnswer("call-1", "On its way")], agents);
    expect(decisions[1]?.events.slice(0, 3)).toEqual([
      { type: "agent.finished", state: "draft", agent: "writer", output: "On its way" },
      { type: "context.updated", key: "reply", value: "On its way" },
      { type: "transition", from: "draft", to: "sent", event: "done" },
    ]);
  });

  it.each([
    ["names Halonic's own loop", { writer: writerAgent("halonic") }],
    ["names no harness", { writer: writerAgent() }],
    ["isn't among the run's agents", { other: writerAgent("claude-code") }],
    ["was kept without agents", undefined],
  ])("keeps the model call when the agent %s", (_case, agents) => {
    const { decisions } = play(reply, [startInput], agents);
    expect(decisions[0]?.effects).toMatchObject([{ type: "call-model", callId: "call-1" }]);
  });
});

verifies("engine.run-call-fails", () => {
  const failed = (callId: string): DecideInput => ({
    type: "effect-failed",
    at: "2026-11-09T09:00:05.000Z",
    callId,
    error: "The model didn't answer.",
    reason: "model-unreachable",
    host: "models.acme.test",
  });

  it("fails the run only for the call it waits on", () => {
    const { decisions, run } = play(reply, [startInput, failed("call-2"), failed("call-1")]);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
    expect(decisions[2]?.events).toEqual([
      {
        type: "run.failed",
        state: "draft",
        error: "The model didn't answer.",
        reason: "model-unreachable",
        host: "models.acme.test",
      },
    ]);
    expect(run).toMatchObject({ status: "failed", pendingCall: null });
  });

  it("puts the sandbox's reason code on run.failed", () => {
    const notReady: DecideInput = {
      type: "effect-failed",
      at: "2026-11-09T09:00:05.000Z",
      callId: "call-1",
      error: "The sandbox can't start on this computer.",
      reason: "sandbox-not-ready",
      sandboxReason: "bubblewrap-missing",
    };
    const { decisions } = play(reply, [startInput, notReady]);
    expect(decisions[1]?.events).toEqual([
      {
        type: "run.failed",
        state: "draft",
        error: "The sandbox can't start on this computer.",
        reason: "sandbox-not-ready",
        sandboxReason: "bubblewrap-missing",
      },
    ]);
  });
});

verifies("engine.provider-text", () => {
  it("puts the provider's text from the failed call on run.failed", () => {
    const failed: DecideInput = {
      type: "effect-failed",
      at: "2026-11-09T09:00:05.000Z",
      callId: "call-1",
      error: "acme refused the call (HTTP 400)",
      reason: "error",
      providerText: { status: 400, text: "max_tokens is too large" },
    };
    const { decisions } = play(reply, [startInput, failed]);
    expect(decisions[1]?.events).toEqual([
      {
        type: "run.failed",
        state: "draft",
        error: "acme refused the call (HTTP 400)",
        reason: "error",
        providerText: { status: 400, text: "max_tokens is too large" },
      },
    ]);
  });
});

verifies("engine.final-state", () => {
  it("completes the run with the initial context and what the run wrote", () => {
    const { log, run } = play(reply, [startInput, answer("call-1", "On its way")]);
    expect(log.at(-1)).toMatchObject({
      type: "run.completed",
      state: "sent",
      context: { tone: "friendly", reply: "On its way" },
    });
    expect(run?.status).toBe("completed");
  });
});

verifies("engine.state-registry", () => {
  typeTest("lists every built state type, typed against the registry", () => {
    expectTypeOf(states).toMatchTypeOf<StateRegistry>();
    expectTypeOf(states.task).toEqualTypeOf<StateHandler<"task">>();
    expectTypeOf<keyof typeof states>().toEqualTypeOf<
      "final" | "foreach" | "parallel" | "task" | "wait" | "workflow"
    >();
  });

  it("fails a run that enters a state type the engine can't run yet", () => {
    // Every type the format knows has a handler now, so this stands for a
    // definition from a later format, with a type this engine doesn't know.
    const later = { type: "loop", on: [] } as unknown as WorkflowState;
    const unknownType: Workflow = { ...reply, states: { ...reply.states, draft: later } };
    const { log } = play(unknownType, [startInput]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      state: "draft",
      error: `The engine can't run "loop" states yet.`,
    });
  });

  it("fails a run that moves to a state the workflow doesn't have", () => {
    const missing: Workflow = { ...reply, initial: "nowhere" };
    const { log } = play(missing, [startInput]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error: 'Workflow "reply" has no state "nowhere".',
    });
  });
});

/** The base of a `run.cant-try` folded right after the run's last event. */
const endedAt = (run: RunState) =>
  ({ runId: run.runId, seq: run.lastSeq + 1, at: startInput.at, type: "run.cant-try" }) as const;

verifies("engine.decide-refusals", () => {
  const refusal = (run: RunState | null, input: DecideInput) => {
    try {
      decide(run, input, { workflow: reply });
    } catch (error) {
      return error instanceof InputRefused ? error.code : error;
    }
    return "accepted";
  };

  it("decides the same way every time", () => {
    const first = play(reply, [startInput, answer("call-1", "On its way")]);
    const second = play(reply, [startInput, answer("call-1", "On its way")]);
    expect(second.decisions).toEqual(first.decisions);
  });

  it("refuses inputs the run can't take, before anything is recorded", () => {
    const running = play(reply, [startInput]).run;
    const completed = play(reply, [startInput, answer("call-1", "ok")]).run;
    expect(refusal(running, startInput)).toBe("engine.run-exists");
    expect(refusal(null, answer("call-1", "ok"))).toBe("engine.run-unknown");
    expect(refusal(completed, answer("call-1", "ok"))).toBe("engine.run-ended");
    // A run that ended at a step it couldn't try has ended too (HAL-4285).
    const cantTry =
      running && evolve(running, { ...endedAt(running), state: "draft", cantTry: [] });
    expect(refusal(cantTry, answer("call-1", "ok"))).toBe("engine.run-ended");
    expect(refusal(running, { type: "send", at: startInput.at, event: "approve" })).toBe(
      "engine.input-not-accepted",
    );
    expect(refusal(running, { type: "timer", at: startInput.at, key: "t" })).toBe(
      "engine.input-not-accepted",
    );
  });
});

describe("decide", () => {
  it("keeps the trigger and parent of a start", () => {
    const trigger = { type: "manual" as const, at: startInput.at };
    const parent = { runId: "r-parent", state: "sub", depth: 1 };
    const { log } = play(reply, [{ ...startInput, trigger, parent }]);
    expect(log[0]).toMatchObject({ trigger, parent });
  });
});
