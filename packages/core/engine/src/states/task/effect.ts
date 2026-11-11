// A task state's agent stops before a connector call that can change
// things (HAL-1532). The engine records `effect.requested` with the key
// `<runId>:<callId>` before it makes the call, so a call that breaks off,
// or that a crash cut short, is never made again on its own: its outcome
// is unknown, and the run waits for a person to `retry` it or `skip` it.

import type { ToolOutcome } from "@halonicjs/events";
import type {
  DecidedEvent,
  Effect,
  EffectDoneInput,
  EffectNeeded,
  SendInput,
  ToolResult,
} from "../../kernel/decide-types.ts";
import { nothing, type StateContext, type StateStep } from "../../kernel/registry.ts";
import {
  type RequestedEffect,
  skippedEffectResult,
  unknownOutcomeEvents,
} from "../../kernel/requested-effect.ts";
import { nextCallId, type PendingCall } from "../../kernel/run-state.ts";
import { stoppedSubagentOf } from "../../kernel/stopped-subagent.ts";

/**
 * How long the engine waits for a connector's answer, in milliseconds: the
 * default `callTimeoutMs` of a plugin's local tool.
 */
export const connectorCallTimeoutMs = 60_000;

/** Records the call under a new call id and its key, then asks for it to be made. */
export function requestEffect(
  { run, stateId }: StateContext,
  stopped: PendingCall,
  { connector, tool, args, resume }: EffectNeeded,
): StateStep {
  const callId = nextCallId(run);
  const effect: RequestedEffect = {
    callId,
    idempotencyKey: `${run.runId}:${callId}`,
    state: stateId,
    agent: stopped.agent,
    connector,
    tool,
    args,
    prompt: stopped.prompt,
    resume,
    unknown: false,
  };
  return makeCall(effect);
}

/**
 * The call has a result. With an answer, the agent goes on with it in a new
 * model call. With an unknown outcome, the run waits for `retry` or `skip`.
 * A result for any other call, such as one delivered twice, changes nothing.
 */
export function takeToolResult(
  { run, stateId }: StateContext,
  input: EffectDoneInput,
  { result, outcome, risk }: ToolResult,
): StateStep {
  const effect = run.effect;
  if (effect === null || effect.unknown || effect.callId !== input.callId) return nothing;
  if (effect.state !== stateId) return nothing;
  const logged: DecidedEvent = {
    type: "tool.result",
    agent: effect.agent,
    tool: effect.tool,
    result,
    outcome,
    ...(risk === undefined ? {} : { risk }),
  };
  if (outcome === "unknown") {
    const waiting: DecidedEvent = {
      type: "run.waiting",
      state: stateId,
      events: [...unknownOutcomeEvents],
    };
    return { events: [logged, waiting], effects: [] };
  }
  return { events: [logged], effects: [goOn(nextCallId(run), effect, result, outcome)] };
}

/** Whether a send answers a call whose outcome is unknown in this state. */
export function answersUnknownEffect({ run, stateId }: StateContext, input: SendInput): boolean {
  const effect = run.effect;
  return effect !== null && effect.unknown && effect.state === stateId
    ? unknownOutcomeEvents.includes(input.event)
    : false;
}

/**
 * A person chose what becomes of a call whose outcome is unknown. `retry`
 * makes it again under the same call id and key, so a connector that did
 * the work the first time can drop the duplicate. `skip` lets the agent go
 * on with a result that says the outcome is unknown.
 */
export function answerUnknownEffect({ run }: StateContext, input: SendInput): StateStep {
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
  return {
    events: [received],
    effects: [goOn(nextCallId(run), effect, skippedEffectResult, "unknown")],
  };
}

/**
 * The record before the call, the start of the call, and the effect that
 * makes it, in that order: the effect runs only once both are stored.
 */
function makeCall(effect: RequestedEffect): StateStep {
  const { callId, idempotencyKey, state, agent, connector, tool, args, resume } = effect;
  const timeoutMs = connectorCallTimeoutMs;
  const events: DecidedEvent[] = [
    {
      type: "effect.requested",
      state,
      agent,
      connector,
      tool,
      args,
      callId,
      idempotencyKey,
      resume,
      ...stoppedSubagentOf(resume),
    },
    { type: "connector.started", state, agent, connector, timeoutMs },
    { type: "tool.called", agent, tool, args },
  ];
  const call: Effect = {
    type: "call-tool",
    callId,
    idempotencyKey,
    state,
    agent,
    connector,
    tool,
    args,
    timeoutMs,
  };
  return { events, effects: [call] };
}

/** The model call in which the agent goes on with the call's result, as the fold asks for it. */
function goOn(
  callId: string,
  effect: RequestedEffect,
  result: string,
  outcome: ToolOutcome,
): Effect {
  return {
    type: "call-model",
    callId,
    state: effect.state,
    agent: effect.agent,
    prompt: effect.prompt,
    resume: { resume: effect.resume, result, outcome },
  };
}
