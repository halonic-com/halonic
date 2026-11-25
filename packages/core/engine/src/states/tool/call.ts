// A tool step's call, once its check has passed: made at once, or after a
// person's OK. It goes through the same records an agent's connector call
// does (`effect.requested`, `connector.started`, `tool.called`, then the
// `call-tool` effect, with the key `<runId>:<callId>`), marked as a tool
// step's (requirement `events.tool-step-marker`), with the state's id where
// an agent's name would be.

import type { DecidedEvent, SendInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import type { StateContext, StateStep } from "../../kernel/registry.ts";
import type { RequestedEffect } from "../../kernel/requested-effect.ts";
import { nextCallId } from "../../kernel/run-state.ts";
import { approvalAnswered, commentOf, nothingToResume } from "../task/approval.ts";
import { makeCall } from "../task/effect.ts";

/** The events a run waiting for an approval takes. */
const approvalEvents: readonly string[] = ["approve", "reject"];

/** Records the call under a new call id and its key, then asks for it to be made. */
export function callTool(
  { run, stateId, state }: StateContext<"tool">,
  tool: string,
  args: Record<string, unknown>,
): StateStep {
  const callId = nextCallId(run);
  const effect: RequestedEffect = {
    callId,
    idempotencyKey: `${run.runId}:${callId}`,
    state: stateId,
    agent: stateId,
    connector: state.connector as string,
    tool,
    args,
    prompt: "",
    resume: nothingToResume,
    unknown: false,
    step: "tool",
  };
  return makeCall(effect);
}

/**
 * Records the approval under a new call id, with the arguments the call
 * will be made with, and waits for a person's answer, as an agent's call
 * that needs an OK does.
 */
export function askForToolApproval(
  { run, stateId, state }: StateContext<"tool">,
  tool: string,
  args: Record<string, unknown>,
): StateStep {
  const requested: DecidedEvent = {
    type: "approval.requested",
    state: stateId,
    agent: stateId,
    tool,
    connector: state.connector as string,
    args,
    callId: nextCallId(run),
    resume: nothingToResume,
    step: "tool",
  };
  const waiting: DecidedEvent = {
    type: "run.waiting",
    state: stateId,
    events: [...approvalEvents],
  };
  return { events: [requested, waiting], effects: [] };
}

/**
 * A person approved or rejected the step's call. An OK makes the call with
 * the arguments the approval showed, never rendered again; a no finishes the
 * step with `rejected`, for the workflow to decide what comes next.
 *
 * @throws InputRefused when no approval of this state waits for an answer
 */
export function answerToolApproval(context: StateContext<"tool">, input: SendInput): StateStep {
  const { run, stateId } = context;
  const approval = approvalAnswered(run.approvals, stateId, input.callId);
  if (approval?.step === undefined) {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" waits for no approval in state "${stateId}".`,
    );
  }
  const { event, payload } = input;
  const approved = event === "approve";
  const comment = commentOf(payload);
  const events: DecidedEvent[] = [
    { type: "event.received", event, ...(payload === undefined ? {} : { payload }) },
    {
      type: "approval.resolved",
      state: stateId,
      agent: approval.agent,
      tool: approval.tool,
      callId: approval.callId,
      approved,
      ...(comment === undefined ? {} : { comment }),
      by: input.by ?? "person",
    },
  ];
  if (!approved) {
    return { events, effects: [], outcome: { type: "finish", event: "rejected" } };
  }
  const call = callTool(context, approval.tool, approval.step.args as Record<string, unknown>);
  return { events: [...events, ...call.events], effects: call.effects };
}

/**
 * A person chose what becomes of a call whose outcome is unknown. `retry`
 * makes it again under the same call id and key, so a connector that did
 * the work the first time can drop the duplicate. `skip` finishes the step
 * with `skipped`, with no output.
 */
export function answerUnknownToolCall({ run }: StateContext<"tool">, input: SendInput): StateStep {
  const effect = run.effect as RequestedEffect;
  const { event, payload } = input;
  const received: DecidedEvent = {
    type: "event.received",
    event,
    ...(payload === undefined ? {} : { payload }),
  };
  if (event === "retry") {
    const retried = makeCall(effect);
    return { events: [received, ...retried.events], effects: retried.effects };
  }
  return { events: [received], effects: [], outcome: { type: "finish", event: "skipped" } };
}
