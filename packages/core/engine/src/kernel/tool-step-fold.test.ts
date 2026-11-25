import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { foldRun, type RunState } from "./run-state.ts";

/** A run log of these event bodies for the run `r-acme`. */
function logOf(bodies: readonly RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "r-acme",
    seq: index + 1,
    at: new Date(Date.UTC(2026, 10, 25, 9, 0, index)).toISOString(),
    ...body,
  }));
}

function folded(bodies: readonly RunEventBody[]): RunState {
  const state = foldRun(logOf(bodies));
  if (state === null) throw new Error("expected a run state");
  return state;
}

const resume = { messages: [], calls: [], step: 0 };

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "watch",
  input: {},
  kind: "run",
  definitionsVersion: "sha-1",
};

/** An agent's approval, as logs written before the tool step's marker have it. */
const agentApproval: RunEventBody[] = [
  started,
  { type: "state.entered", state: "draft" },
  { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply" },
  {
    type: "approval.requested",
    state: "draft",
    agent: "writer",
    tool: "send_mail",
    args: { to: "support" },
    callId: "call-2",
    resume,
  },
  { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
  { type: "event.received", event: "approve" },
  {
    type: "approval.resolved",
    state: "draft",
    agent: "writer",
    tool: "send_mail",
    callId: "call-2",
    approved: true,
  },
];

/** The tool step `merge` asks, a person approves, and the call is made. */
const toolStepApproval: RunEventBody[] = [
  started,
  { type: "state.entered", state: "merge" },
  {
    type: "approval.requested",
    state: "merge",
    agent: "merge",
    tool: "merge_pull_request",
    connector: "github",
    args: { pr: 7 },
    callId: "call-1",
    resume,
    step: "tool",
  },
  { type: "run.waiting", state: "merge", events: ["approve", "reject"] },
  { type: "event.received", event: "approve" },
  {
    type: "approval.resolved",
    state: "merge",
    agent: "merge",
    tool: "merge_pull_request",
    callId: "call-1",
    approved: true,
  },
];

const toolStepCall: RunEventBody[] = [
  {
    type: "effect.requested",
    state: "merge",
    agent: "merge",
    connector: "github",
    tool: "merge_pull_request",
    args: { pr: 7 },
    callId: "call-2",
    idempotencyKey: "r-acme:call-2",
    resume,
    step: "tool",
  },
  { type: "tool.result", agent: "merge", tool: "merge_pull_request", result: "{}", outcome: "ok" },
];

verifies("engine.tool-state", () => {
  it("folds an agent's approval with no marker as before: the agent goes on in a model call", () => {
    const state = folded(agentApproval);

    expect(state.approvals).toEqual([]);
    expect(state.calls).toBe(3);
    expect(state.pendingCall).toEqual({
      callId: "call-3",
      state: "draft",
      agent: "writer",
      prompt: "Reply",
      resume: { resume, approved: true },
    });
  });

  it("keeps the arguments a tool step's approval showed, and sets up no model call", () => {
    const waiting = folded(toolStepApproval.slice(0, 4));
    expect(waiting.approvals).toMatchObject([{ step: { kind: "tool", args: { pr: 7 } } }]);

    const approved = folded(toolStepApproval);
    expect(approved.approvals).toEqual([]);
    expect(approved.pendingCall).toBeNull();
    expect(approved.calls).toBe(1);
  });

  it("sets up no model call after a tool step's call has its result", () => {
    const state = folded([...toolStepApproval, ...toolStepCall]);

    expect(state.effect).toBeNull();
    expect(state.pendingCall).toBeNull();
    expect(state.calls).toBe(2);
  });
});
