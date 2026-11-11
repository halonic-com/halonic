import type { CantTryStep, RunFailureReason } from "@halonicjs/events";
import type { Agent, Workflow } from "@halonicjs/format";
import { getState, type Scope, selectTransition } from "@halonicjs/workflow";
import { states } from "../generated/states.ts";
import type {
  DecidedEvent,
  DecideInput,
  Decision,
  Effect,
  EffectFailedInput,
  RunDefinitions,
  SendInput,
  StartInput,
} from "./decide-types.ts";
import { InputRefused } from "./input-refused.ts";
import type { BuiltStateType, StateContext, StateHandler, StateStep } from "./registry.ts";
import {
  brokeOff,
  effectCallerOf,
  type RequestedEffect,
  unknownOutcomeEvents,
} from "./requested-effect.ts";
import { branchOfCall } from "./run-branches.ts";
import { callOf, evolve, hasEnded, type RunState, type WaitingApproval } from "./run-state.ts";
import { foldableEvent } from "./saved-artifacts.ts";

/**
 * A decision being built. Every event is folded into `run` as it is
 * decided, so the next handler sees the run as it will be once appended.
 */
interface Draft {
  run: RunState;
  readonly events: DecidedEvent[];
  readonly effects: Effect[];
  readonly at: string;
  readonly workflow: Workflow;
  readonly agents: Readonly<Record<string, Agent>>;
  readonly workflows: Readonly<Record<string, Workflow>>;
}

/**
 * What a run does next, given its state and one input. Pure: no input or
 * output, no clock, and the same arguments always give the same decision.
 *
 * @throws InputRefused when the run can't take the input
 */
export function decide(
  run: RunState | null,
  input: DecideInput,
  definitions: RunDefinitions,
): Decision {
  checkRunTakes(run, input);
  if (input.type === "start") {
    return start(input, definitions);
  }
  if (run === null) {
    throw new InputRefused("engine.run-unknown", "The run has not started.");
  }
  // A branch's failed call goes to its `parallel` state, which decides what it means.
  if (input.type === "effect-failed" && branchOfCall(run.parallel, input.callId) === null) {
    return failedEffect(run, input);
  }
  if (run.state === null) {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" has entered no state, so it takes no ${input.type} input.`,
    );
  }
  const draft: Draft = {
    run,
    events: [],
    effects: [],
    at: input.at,
    workflow: definitions.workflow,
    agents: definitions.agents ?? {},
    workflows: definitions.workflows ?? {},
  };
  const stateId = run.state;
  const handler = handlerFor(draft, stateId);
  if (handler !== undefined) {
    settle(draft, stateId, handler.onInput(contextOf(draft, stateId), input));
  }
  return decisionOf(draft);
}

/**
 * A child run tells its parent each time it waits or ends, so the parent
 * can wait with it or go on. A run with no parent tells no one.
 *
 * @param run - the run as it is after the decided events
 */
export function tellParent(run: RunState): Effect[] {
  if (run.parent === null || run.status === "running") {
    return [];
  }
  return [{ type: "tell-parent", parentRunId: run.parent.runId, childRunId: run.runId }];
}

function decisionOf(draft: Draft): Decision {
  const told = draft.events.length === 0 ? [] : tellParent(draft.run);
  return { events: draft.events, effects: [...draft.effects, ...told] };
}

/**
 * The refusals that depend on the run alone, not on its definitions: a start
 * for a run that exists, any other input for a run that doesn't, any input
 * for a run that has ended, and a send or timer the run doesn't take now.
 * `step` checks these before it reads the run's definitions.
 *
 * @throws InputRefused when the run can't take the input
 */
export function checkRunTakes(run: RunState | null, input: DecideInput): void {
  if (input.type === "start") {
    if (run !== null) {
      throw new InputRefused("engine.run-exists", `Run "${run.runId}" has already started.`);
    }
    return;
  }
  if (run === null) {
    throw new InputRefused("engine.run-unknown", "The run has not started.");
  }
  if (hasEnded(run.status)) {
    throw new InputRefused("engine.run-ended", `Run "${run.runId}" has ended (${run.status}).`);
  }
  if (input.type === "send") {
    checkRunTakesSend(run, input);
  }
  if (input.type === "timer" && run.status !== "waiting") {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" isn't waiting, so it takes no timer in state "${run.state}".`,
    );
  }
}

/**
 * A send that names a call must name one the run waits on, an approval or a
 * call whose outcome is unknown: a person who answered one that has since
 * moved on must not answer the next one by accident. Then the run must be
 * waiting, for this event.
 */
function checkRunTakesSend(run: RunState, input: SendInput): void {
  const waitsOn = (approval: WaitingApproval) => approval.callId === input.callId;
  const effectWaits = run.effect?.unknown === true && run.effect.callId === input.callId;
  if (input.callId !== undefined && !run.approvals.some(waitsOn) && !effectWaits) {
    throw new InputRefused(
      "engine.decision-callid-must-match",
      `Run "${run.runId}" doesn't wait on call "${input.callId}".`,
    );
  }
  if (run.status !== "waiting" || !run.accepts.includes(input.event)) {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" doesn't take "${input.event}" in state "${run.state}" now.`,
    );
  }
}

function start(input: StartInput, definitions: RunDefinitions): Decision {
  const workflow = definitions.workflow;
  const {
    type: _type,
    at,
    runId,
    trigger,
    parent,
    harness,
    cantTry = [],
    version,
    ...fields
  } = input;
  const started: DecidedEvent = {
    type: "run.started",
    ...fields,
    ...(trigger === undefined ? {} : { trigger }),
    ...(parent === undefined ? {} : { parent }),
    ...(harness === undefined ? {} : { harness }),
    ...(cantTry.length === 0 ? {} : { cantTry: [...cantTry] }),
    ...(version === undefined ? {} : { version }),
  };
  const draft: Draft = {
    run: evolve(null, { ...started, runId, seq: 1, at }),
    events: [started],
    effects: [],
    at,
    workflow,
    agents: definitions.agents ?? {},
    workflows: definitions.workflows ?? {},
  };
  if (cantTry.some((found) => found.step === null)) {
    // The whole item can't be tried, so the run enters no state at all.
    endCantTry(draft, null, []);
  } else {
    // The initial context goes in the log, so a running or waiting run's
    // summary holds it from the start.
    for (const [key, value] of Object.entries(workflow.context)) {
      emit(draft, { type: "context.updated", key, value });
    }
    enter(draft, workflow.initial);
  }
  return decisionOf(draft);
}

/**
 * Only a call the run waits on fails it: the task state's, or any item's of
 * a `foreach` state. A failure of any other call, such as one delivered
 * after the run moved on, changes nothing. A connector call that can change
 * things doesn't fail the run: no one knows whether it did its work, so its
 * outcome is unknown and the run waits for a person.
 */
function failedEffect(run: RunState, input: EffectFailedInput): Decision {
  const effect = run.effect;
  if (effect !== null && !effect.unknown && effect.callId === input.callId) {
    return effectCutShort(run, effect, input.error);
  }
  if (callOf(run, input.callId) === null) {
    return { events: [], effects: [] };
  }
  if (input.cantTry !== undefined) {
    const cantTry = [...run.cantTry, input.cantTry];
    const ended: DecidedEvent = { type: "run.cant-try", state: run.state, cantTry };
    return { events: [ended], effects: tellParent({ ...run, status: "cant-try" }) };
  }
  const { error, reason, host, sandboxReason, providerText } = input;
  const failed: DecidedEvent = {
    type: "run.failed",
    state: run.state,
    error,
    reason,
    ...(host === undefined ? {} : { host }),
    ...(sandboxReason === undefined ? {} : { sandboxReason }),
    ...(providerText === undefined ? {} : { providerText }),
  };
  return { events: [failed], effects: tellParent({ ...run, status: "failed" }) };
}

/** The same events a call that broke off records, as `takeToolResult` does. */
function effectCutShort(run: RunState, effect: RequestedEffect, error: string): Decision {
  const { state, tool } = effect;
  const agent = effectCallerOf(effect);
  const events: DecidedEvent[] = [
    { type: "tool.result", agent, tool, result: brokeOff(error), outcome: "unknown" },
    { type: "run.waiting", state, events: [...unknownOutcomeEvents] },
  ];
  return { events, effects: tellParent({ ...run, status: "waiting" }) };
}

function emit(draft: Draft, event: DecidedEvent): void {
  draft.events.push(event);
  draft.run = evolve(draft.run, {
    ...foldableEvent(event),
    runId: draft.run.runId,
    seq: draft.run.lastSeq + 1,
    at: draft.at,
  });
}

function fail(
  draft: Draft,
  state: string | null,
  error: string,
  reason: RunFailureReason = "error",
): void {
  emit(draft, { type: "run.failed", state, error, reason });
}

/**
 * End the run at a step it couldn't try, with every step it couldn't try:
 * the ones it knows, then the ones just `found`.
 */
function endCantTry(draft: Draft, state: string | null, found: readonly CantTryStep[]): void {
  emit(draft, { type: "run.cant-try", state, cantTry: [...draft.run.cantTry, ...found] });
}

/** Enter a state; one the run can't try ends the run there, as a failed step would. */
function enter(draft: Draft, stateId: string): void {
  emit(draft, { type: "state.entered", state: stateId });
  if (draft.run.cantTry.some((found) => found.step === stateId)) {
    endCantTry(draft, stateId, []);
    return;
  }
  const handler = handlerFor(draft, stateId);
  if (handler !== undefined) {
    settle(draft, stateId, handler.enter(contextOf(draft, stateId)));
  }
}

/** Add a handler's step to the draft, then follow its outcome. */
function settle(draft: Draft, stateId: string, step: StateStep): void {
  for (const event of step.events) {
    emit(draft, event);
  }
  draft.effects.push(...step.effects);
  if (step.outcome?.type === "fail") {
    fail(draft, stateId, step.outcome.error, step.outcome.reason);
  }
  if (step.outcome?.type === "cant-try") {
    endCantTry(draft, stateId, step.outcome.found);
  }
  if (step.outcome?.type === "finish") {
    follow(draft, stateId, step.outcome.event);
  }
  if (step.outcome?.type === "take") {
    move(draft, stateId, step.outcome.to, step.outcome.event);
  }
}

/** Take the transition the event fires, or fail the run when there is none. */
function follow(draft: Draft, from: string, event: string): void {
  const transition = selectTransition(draft.workflow, from, event, scopeOf(draft));
  if (transition === null) {
    fail(draft, from, `State "${from}" has no transition for "${event}".`);
    return;
  }
  move(draft, from, transition.to, event);
}

function move(draft: Draft, from: string, to: string, event: string): void {
  emit(draft, { type: "transition", from, to, event });
  enter(draft, to);
}

/**
 * The handler for a state's type. A missing state or a type the engine
 * can't run yet fails the run, and `undefined` tells the caller to stop.
 */
function handlerFor(draft: Draft, stateId: string): StateHandler<BuiltStateType> | undefined {
  if (!Object.hasOwn(draft.workflow.states, stateId)) {
    fail(draft, stateId, `Workflow "${draft.workflow.id}" has no state "${stateId}".`);
    return undefined;
  }
  const type = getState(draft.workflow, stateId).type;
  if (!isBuilt(type)) {
    fail(draft, stateId, `The engine can't run "${type}" states yet.`);
    return undefined;
  }
  return states[type];
}

function isBuilt(type: string): type is BuiltStateType {
  return Object.hasOwn(states, type);
}

function scopeOf(draft: Draft): Scope {
  return {
    input: draft.run.input,
    context: { ...draft.workflow.context, ...draft.run.context },
  };
}

function contextOf(draft: Draft, stateId: string): StateContext {
  return {
    run: draft.run,
    stateId,
    state: getState(draft.workflow, stateId),
    workflow: draft.workflow,
    agents: draft.agents,
    workflows: draft.workflows,
    scope: scopeOf(draft),
    at: draft.at,
  };
}
