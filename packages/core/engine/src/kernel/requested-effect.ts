// A connector call that can change things, as the run log folds it: from
// its `effect.requested`, through its `tool.result`, to the model call in
// which its agent goes on. A call whose outcome is unknown stays until a
// person has it tried again (`retry`) or skips it (`skip`).

import type { AgentResume, RunEvent, ToolOutcome } from "@halonicjs/events";
import type { RunState } from "./run-state.ts";
import { stoppedSubagentOf } from "./stopped-subagent.ts";

/** Where an agent stopped for a connector call that can change things, and the call's result. */
export interface ResumeAfterEffect {
  /** The conversation so far; the call that was made is `calls[0]`. */
  readonly resume: AgentResume;
  /** The connector's text result, or the text that stands in for it when the outcome is unknown. */
  readonly result: string;
  readonly outcome: ToolOutcome;
}

/**
 * A connector call that can change things, from its `effect.requested`
 * until its result is in or a person skips it.
 */
export interface RequestedEffect {
  /** `call-<n>`, unique in the run, and the same when a person has the call tried again. */
  readonly callId: string;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly agent: string;
  readonly connector: string;
  readonly tool: string;
  readonly args: unknown;
  /** The prompt of the model call that stopped for it, for the call that goes on. */
  readonly prompt: string;
  readonly resume: AgentResume;
  /** True once the call broke off without an answer: the run waits for `retry` or `skip`. */
  readonly unknown: boolean;
}

/**
 * The text the agent gets as the result of a call whose outcome is unknown,
 * once a person chose to skip it rather than try it again.
 */
export const skippedEffectResult =
  "The call broke off without an answer, so it may or may not have done its work. " +
  "A person chose to go on without trying it again.";

/** The events a run waiting on a call whose outcome is unknown takes. */
export const unknownOutcomeEvents: readonly string[] = ["retry", "skip"];

/** The text of a call that broke off: it may or may not have done its work. */
export function brokeOff(why: string): string {
  return `The call broke off without an answer, so it may or may not have done its work: ${why}`;
}

/** A send moves a waiting run on; a `skip` of a call whose outcome is unknown lets its agent go on. */
export function receiveEvent(state: RunState, event: string): RunState {
  const running = { ...state, status: "running" as const, accepts: [] };
  const effect = state.effect;
  if (event !== "skip" || effect === null || !effect.unknown) {
    return running;
  }
  return goOnAfterEffect(running, effect, skippedEffectResult, "unknown");
}

/**
 * An agent stopped before a connector call that can change things. The
 * call takes a call id of its own, and the model call that stopped is over.
 * A request again under the same call id is a person's `retry`: it keeps
 * the id and the prompt, and waits for the result again.
 */
export function takeEffectRequest(
  state: RunState,
  event: Extract<RunEvent, { type: "effect.requested" }>,
): RunState {
  const { callId, idempotencyKey, state: stateId, agent, connector, tool, args, resume } = event;
  const retried = state.effect?.callId === callId ? state.effect : null;
  const stopped = state.pendingCall?.state === stateId ? state.pendingCall : null;
  const prompt = retried?.prompt ?? stopped?.prompt ?? "";
  return {
    ...state,
    calls: retried === null ? state.calls + 1 : state.calls,
    effect: {
      callId,
      idempotencyKey,
      state: stateId,
      agent,
      connector,
      tool,
      args,
      prompt,
      resume,
      unknown: false,
    },
    pendingCall: stopped === null ? state.pendingCall : null,
  };
}

/**
 * The agent whose call the effect is, which its `tool.called` and
 * `tool.result` name: the innermost subagent when the state's agent
 * stopped inside one (HAL-3361), so the log doesn't credit the state's
 * agent with its subagent's call.
 */
export function effectCallerOf({
  agent,
  resume,
}: Pick<RequestedEffect, "agent" | "resume">): string {
  return stoppedSubagentOf(resume).subagent ?? agent;
}

/**
 * The result of the connector call the run waits on. With an answer, the
 * agent goes on with it; with an unknown outcome, the call stays, and the
 * run waits for a person. Any other `tool.result` changes nothing.
 */
export function takeEffectResult(
  state: RunState,
  event: Extract<RunEvent, { type: "tool.result" }>,
): RunState {
  const effect = state.effect;
  if (effect === null || effect.unknown || effectCallerOf(effect) !== event.agent) return state;
  if (effect.tool !== event.tool) return state;
  if (event.outcome === "unknown") {
    return { ...state, effect: { ...effect, unknown: true } };
  }
  return goOnAfterEffect(state, effect, event.result, event.outcome ?? "ok");
}

/**
 * The call is over. When the run is still in its state, its agent goes on
 * with the result in a new model call.
 */
function goOnAfterEffect(
  state: RunState,
  effect: RequestedEffect,
  result: string,
  outcome: ToolOutcome,
): RunState {
  if (effect.state !== state.state) {
    return { ...state, effect: null };
  }
  const calls = state.calls + 1;
  const { state: stateId, agent, prompt } = effect;
  return {
    ...state,
    effect: null,
    calls,
    pendingCall: {
      callId: `call-${calls}`,
      state: stateId,
      agent,
      prompt,
      resume: { resume: effect.resume, result, outcome },
    },
  };
}
