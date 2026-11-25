// A run's approvals as the kernel folds them: a tool call that waits for a
// person's OK, and the model call that goes on once they answer.

import type { AgentResume, RunEvent } from "@halonicjs/events";
import type { RunState } from "./run-state.ts";

/** Where an agent stopped for a person's OK, and what the person answered. */
export interface ResumeAfterApproval {
  /** The conversation so far; the call that waited for the OK is `calls[0]`. */
  readonly resume: AgentResume;
  readonly approved: boolean;
  /** What the person wrote with the answer, if anything. */
  readonly comment?: string;
  /** The connector the waiting call's tool comes from, as its approval names it; absent when it names none. */
  readonly connector?: string;
}

/** A tool call waiting for a person's OK, as its `approval.requested` asked. */
export interface WaitingApproval {
  /** `call-<n>`, unique in the run. A `send` that names a call id must name one of these. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly tool: string;
  /** The prompt of the model call that stopped for it, for the call that goes on. */
  readonly prompt: string;
  readonly resume: AgentResume;
  /** The connector the tool comes from, as `approval.requested` names it; absent in older logs. */
  readonly connector?: string;
  /**
   * Set when a tool step asks: `"tool"`, with the arguments the call is made with once a person
   * approves, as the approval showed them. No agent goes on after the answer.
   */
  readonly step?: { readonly kind: "tool"; readonly args: unknown };
}

/**
 * An agent stopped at a tool call that needs a person's OK. The approval
 * takes a call id of its own, and the model call that stopped is over.
 */
export function requestApproval(
  state: RunState,
  event: Extract<RunEvent, { type: "approval.requested" }>,
): RunState {
  const { callId, state: stateId, agent, tool, resume, connector, step, args } = event;
  const stopped = state.pendingCall?.state === stateId ? state.pendingCall : null;
  const approval: WaitingApproval = {
    callId,
    state: stateId,
    agent,
    tool,
    prompt: stopped?.prompt ?? "",
    resume,
    ...(connector === undefined ? {} : { connector }),
    ...(step === undefined ? {} : { step: { kind: step, args } }),
  };
  return {
    ...state,
    calls: state.calls + 1,
    approvals: [...state.approvals, approval],
    pendingCall: stopped === null ? state.pendingCall : null,
  };
}

/**
 * A person answered an approval. When the run is still in the approval's
 * state, its agent goes on with the answer in a new model call; a tool
 * step's approval has no agent, so its state decides what the answer means.
 */
export function resolveApproval(
  state: RunState,
  event: Extract<RunEvent, { type: "approval.resolved" }>,
): RunState {
  const approval = state.approvals.find((waiting) => waiting.callId === event.callId);
  const approvals = state.approvals.filter((waiting) => waiting.callId !== event.callId);
  if (approval === undefined || approval.state !== state.state || approval.step !== undefined) {
    return { ...state, approvals };
  }
  const calls = state.calls + 1;
  const { approved, comment } = event;
  const resume: ResumeAfterApproval = {
    resume: approval.resume,
    approved,
    ...(comment === undefined ? {} : { comment }),
    ...(approval.connector === undefined ? {} : { connector: approval.connector }),
  };
  const { state: stateId, agent, prompt } = approval;
  return {
    ...state,
    approvals,
    calls,
    pendingCall: { callId: `call-${calls}`, state: stateId, agent, prompt, resume },
  };
}
