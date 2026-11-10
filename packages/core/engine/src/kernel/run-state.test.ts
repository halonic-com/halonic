import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { evolve, foldRun, nextCallId, type RunState } from "./run-state.ts";

/** A run log of these event bodies, one second apart, for the run `r-acme`. */
function logOf(bodies: readonly RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "r-acme",
    seq: index + 1,
    at: new Date(Date.UTC(2026, 10, 9, 9, 0, index)).toISOString(),
    ...body,
  }));
}

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "reply",
  input: { message: "Where is my invoice?" },
  kind: "run",
  definitionsVersion: "sha-1",
};

const draftLog = logOf([
  started,
  { type: "state.entered", state: "draft" },
  { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply" },
  { type: "agent.finished", state: "draft", agent: "writer", output: "On its way" },
  { type: "context.updated", key: "reply", value: "On its way" },
]);

function folded(events: readonly RunEvent[]): RunState {
  const state = foldRun(events);
  if (state === null) {
    throw new Error("expected a run state");
  }
  return state;
}

verifies("engine.run-state-fold", () => {
  it("folds a run's events into its state", () => {
    expect(folded(draftLog)).toEqual({
      runId: "r-acme",
      hubId: "acme",
      workflowId: "reply",
      kind: "run",
      definitionsVersion: "sha-1",
      input: { message: "Where is my invoice?" },
      parent: null,
      status: "running",
      state: "draft",
      enteredAt: "2026-11-09T09:00:01.000Z",
      context: { reply: "On its way" },
      calls: 1,
      pendingCall: null,
      lastSeq: 5,
    });
  });

  it("gives the same state from a snapshot of an earlier part of the log", () => {
    for (let split = 1; split < draftLog.length; split++) {
      const snapshot: unknown = JSON.parse(JSON.stringify(folded(draftLog.slice(0, split))));
      expect(foldRun(draftLog.slice(split), snapshot as RunState)).toEqual(folded(draftLog));
    }
  });

  it("refuses a log that doesn't start with run.started", () => {
    expect(() => foldRun(draftLog.slice(1))).toThrow(
      'A run log starts with run.started; run "r-acme" starts with state.entered.',
    );
  });

  it("refuses a second run.started", () => {
    const [first] = draftLog;
    if (first === undefined) {
      throw new Error("expected an event");
    }
    expect(() => evolve(folded(draftLog), { ...first, seq: 6 })).toThrow(
      'Run "r-acme" has a second run.started at seq 6.',
    );
  });

  it("folds nothing to null", () => {
    expect(foldRun([])).toBeNull();
  });

  it("never changes the state it is given", () => {
    const before = folded(draftLog.slice(0, 2));
    const copy = structuredClone(before);
    const [, , agentStarted] = draftLog;
    if (agentStarted === undefined) {
      throw new Error("expected an event");
    }
    evolve(before, agentStarted);
    expect(before).toEqual(copy);
  });
});

describe("evolve", () => {
  it("waits on the call a state's agent started, and counts call ids", () => {
    const state = folded(draftLog.slice(0, 3));
    expect(state.pendingCall).toEqual({
      callId: "call-1",
      state: "draft",
      agent: "writer",
      prompt: "Reply",
    });
    expect(nextCallId(state)).toBe("call-2");
  });

  it("starts no call for a subagent", () => {
    const state = folded([
      ...draftLog.slice(0, 3),
      ...logOf([
        { type: "agent.started", state: "draft", agent: "checker", prompt: "?", parent: "writer" },
        {
          type: "agent.finished",
          state: "draft",
          agent: "checker",
          output: "ok",
          parent: "writer",
        },
      ]).map((event, index) => ({ ...event, seq: 4 + index })),
    ]);
    expect(state.calls).toBe(1);
    expect(state.pendingCall?.callId).toBe("call-1");
  });

  it("follows the status through waiting, waking and ending", () => {
    const waiting = logOf([
      started,
      { type: "state.entered", state: "review" },
      { type: "run.waiting", state: "review", events: ["approve"] },
    ]);
    expect(folded(waiting).status).toBe("waiting");
    const woken = logOf([...waiting, { type: "event.received", event: "approve" }]);
    expect(folded(woken).status).toBe("running");
    const completed = logOf([
      ...woken,
      { type: "state.entered", state: "done" },
      { type: "run.completed", state: "done", context: { reply: "ok" } },
    ]);
    expect(folded(completed)).toMatchObject({
      status: "completed",
      state: "done",
      context: { reply: "ok" },
    });
  });

  it("drops the pending call when the run fails", () => {
    const failed = logOf([
      ...draftLog.slice(0, 3),
      { type: "run.failed", state: "draft", error: "the model is offline" },
    ]);
    expect(folded(failed)).toMatchObject({ status: "failed", pendingCall: null });
  });

  it("keeps the parent of a child run", () => {
    const parent = { runId: "r-parent", state: "sub", depth: 1 };
    expect(folded(logOf([{ ...started, parent }])).parent).toEqual(parent);
  });
});
