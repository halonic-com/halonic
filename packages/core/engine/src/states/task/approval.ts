// A task state's agent can stop at a tool call that needs a person's OK.
// The engine gives the approval a call id of its own (`call-<n>`), so a
// person's answer reaches exactly that call, whatever id the model used.

import { isPlainObject } from "@halonicjs/std";
import type { ApprovalNeeded, DecidedEvent, SendInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import type { StateContext, StateStep } from "../../kernel/registry.ts";
import {
  nextCallId,
  type PendingCall,
  type ResumeAfterApproval,
  type WaitingApproval,
} from "../../kernel/run-state.ts";

/** The events a run waiting for an approval takes. */
const approvalEvents: readonly string[] = ["approve", "reject"];

/** Records the approval under a new call id, and waits for a person's answer. */
export function askForApproval(
  { run, stateId }: StateContext,
  stopped: PendingCall,
  { tool, args, resume }: ApprovalNeeded,
): StateStep {
  const requested: DecidedEvent = {
    type: "approval.requested",
    state: stateId,
    agent: stopped.agent,
    tool,
    args,
    callId: nextCallId(run),
    resume,
  };
  const waiting: DecidedEvent = {
    type: "run.waiting",
    state: stateId,
    events: [...approvalEvents],
  };
  return { events: [requested, waiting], effects: [] };
}

/**
 * A person approved or rejected: record the answer as theirs, and let the
 * agent go on with it in a new model call. `decide` has already checked
 * that the run waits for this event, and for the call the send names.
 *
 * @throws InputRefused when no approval of this state waits for an answer
 */
export function answerApproval({ run, stateId }: StateContext, input: SendInput): StateStep {
  const approval = approvalAnswered(run.approvals, stateId, input.callId);
  if (approval === undefined) {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" waits for no approval in state "${stateId}".`,
    );
  }
  const { event, payload } = input;
  const approved = event === "approve";
  const comment = commentOf(payload);
  const { callId, agent, tool, prompt } = approval;
  const events: DecidedEvent[] = [
    { type: "event.received", event, ...(payload === undefined ? {} : { payload }) },
    {
      type: "approval.resolved",
      state: stateId,
      agent,
      tool,
      callId,
      approved,
      ...(comment === undefined ? {} : { comment }),
      by: "person",
    },
  ];
  const resume: ResumeAfterApproval = {
    resume: approval.resume,
    approved,
    ...(comment === undefined ? {} : { comment }),
  };
  return {
    events,
    effects: [
      { type: "call-model", callId: nextCallId(run), state: stateId, agent, prompt, resume },
    ],
  };
}

/** The approval a send answers: the one it names, or else the state's oldest. */
function approvalAnswered(
  approvals: readonly WaitingApproval[],
  stateId: string,
  callId: string | undefined,
): WaitingApproval | undefined {
  const ofState = approvals.filter((approval) => approval.state === stateId);
  return callId === undefined ? ofState[0] : ofState.find((approval) => approval.callId === callId);
}

/** The person's comment, when the payload is `{ comment: "…" }`. */
function commentOf(payload: unknown): string | undefined {
  if (!isPlainObject(payload)) return undefined;
  const comment = payload["comment"];
  return typeof comment === "string" ? comment : undefined;
}
