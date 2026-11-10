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
      enteredSeq: 2,
      accepts: [],
      approvals: [],
      context: { reply: "On its way" },
      calls: 1,
      pendingCall: null,
      effect: null,
      child: null,
      parallel: null,
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
    expect(folded(waiting)).toMatchObject({ status: "waiting", accepts: ["approve"] });
    const woken = logOf([...waiting, { type: "event.received", event: "approve" }]);
    expect(folded(woken)).toMatchObject({ status: "running", accepts: [] });
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

  it("keeps the state's visit, so its timers can tell an earlier visit from this one", () => {
    const again = logOf([
      started,
      { type: "state.entered", state: "review" },
      { type: "transition", from: "review", to: "review", event: "again" },
      { type: "state.entered", state: "review" },
    ]);
    expect(folded(again)).toMatchObject({
      enteredSeq: 4,
      enteredAt: "2026-11-09T09:00:03.000Z",
    });
  });

  it("lists the approvals the run waits on, oldest first, until each is resolved", () => {
    const request = (callId: string): RunEventBody => ({
      type: "approval.requested",
      state: "draft",
      agent: "writer",
      tool: "send_mail",
      args: {},
      callId,
      resume: { messages: [], calls: [], step: 1 },
    });
    const callIds = (state: RunState) => state.approvals.map((approval) => approval.callId);
    const requested = logOf([started, request("call-2"), request("call-3")]);
    expect(callIds(folded(requested))).toEqual(["call-2", "call-3"]);
    const resolved = logOf([
      ...requested,
      {
        type: "approval.resolved",
        state: "draft",
        agent: "writer",
        tool: "send_mail",
        callId: "call-2",
        approved: true,
      },
    ]);
    expect(callIds(folded(resolved))).toEqual(["call-3"]);
    const failed = logOf([...requested, { type: "run.failed", state: "draft", error: "stopped" }]);
    expect(folded(failed)).toMatchObject({ approvals: [], accepts: [] });
  });

  it("ends the call an agent stopped for an approval, and gives the approval a call id", () => {
    const resume = {
      messages: [],
      calls: [{ id: "m-1", name: "send_mail", arguments: {} }],
      step: 1,
    };
    const stopped = folded([
      ...draftLog.slice(0, 3),
      ...logOf([
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          args: {},
          callId: "call-2",
          resume,
        },
      ]).map((event) => ({ ...event, seq: 4 })),
    ]);
    expect(stopped).toMatchObject({ calls: 2, pendingCall: null });
    expect(stopped.approvals).toEqual([
      {
        callId: "call-2",
        state: "draft",
        agent: "writer",
        tool: "send_mail",
        prompt: "Reply",
        resume,
      },
    ]);
    expect(nextCallId(stopped)).toBe("call-3");
  });

  it("goes on with the agent in a new call once a person answers its approval", () => {
    const resume = {
      messages: [],
      calls: [{ id: "m-1", name: "send_mail", arguments: {} }],
      step: 1,
    };
    const answered = folded([
      ...draftLog.slice(0, 3),
      ...logOf([
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          args: {},
          callId: "call-2",
          resume,
        },
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          callId: "call-2",
          approved: false,
          comment: "Not this one",
          by: "person",
        },
      ]).map((event, index) => ({ ...event, seq: 4 + index })),
    ]);
    expect(answered).toMatchObject({ calls: 3, approvals: [] });
    expect(answered.pendingCall).toEqual({
      callId: "call-3",
      state: "draft",
      agent: "writer",
      prompt: "Reply",
      resume: { resume, approved: false, comment: "Not this one" },
    });
  });

  it("starts no call for an approval answered after the run left its state", () => {
    const request: RunEventBody = {
      type: "approval.requested",
      state: "draft",
      agent: "writer",
      tool: "send_mail",
      args: {},
      callId: "call-1",
      resume: { messages: [], calls: [], step: 1 },
    };
    const left = folded(
      logOf([
        started,
        { type: "state.entered", state: "draft" },
        request,
        { type: "state.entered", state: "review" },
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          callId: "call-1",
          approved: true,
        },
      ]),
    );
    expect(left).toMatchObject({ approvals: [], pendingCall: null, calls: 1 });
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
