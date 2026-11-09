import type { RunEvent } from "@halonicjs/events";
import type { Workflow, WorkflowState } from "@halonicjs/format";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { states } from "../generated/states.ts";
import { decide, InputRefused } from "./decide.ts";
import type { DecideInput, Decision, RunDefinitions, StartInput } from "./decide-types.ts";
import type { StateHandler, StateRegistry } from "./registry.ts";
import { foldRun, type RunState } from "./run-state.ts";

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

/**
 * Plays inputs through `decide` the way `step` will: each decision's events
 * are stamped and appended, and the next input is decided on the folded log.
 */
function play(workflow: Workflow, inputs: readonly DecideInput[]) {
  const definitions: RunDefinitions = { workflow };
  const log: RunEvent[] = [];
  const decisions: Decision[] = [];
  let run: RunState | null = null;
  for (const input of inputs) {
    const decision = decide(run, input, definitions);
    decisions.push(decision);
    for (const event of decision.events) {
      log.push({
        ...event,
        runId: input.type === "start" ? input.runId : "r-acme",
        seq: log.length + 1,
        at: input.at,
      });
    }
    run = foldRun(log);
  }
  return { log, decisions, run };
}

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
    expectTypeOf<keyof typeof states>().toEqualTypeOf<"final" | "task">();
  });

  it("fails a run that enters a state type the engine can't run yet", () => {
    const waiting: Workflow = {
      ...reply,
      states: { ...reply.states, draft: { type: "wait", on: [] } },
    };
    const { log } = play(waiting, [startInput]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      state: "draft",
      error: `The engine can't run "wait" states yet.`,
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
