import type { StateType, Workflow, WorkflowState } from "@halonicjs/format";
import type { Scope } from "@halonicjs/workflow";
import type { DecidedEvent, DecideInput, Effect } from "./decide-types.ts";
import type { RunState } from "./run-state.ts";

/**
 * The state types the engine can run so far. Each one has a folder in
 * `src/states`. The rest of the format's union joins as its folder lands
 * (`wait` in 3(c), the composite states in step 5); once all six are here,
 * the registry is typed against `StateType` itself.
 */
export type BuiltStateType = Extract<StateType, "task" | "final">;

/** What a state handler sees: the run as it is now, and the state it is in. */
export interface StateContext {
  readonly run: RunState;
  readonly stateId: string;
  readonly state: WorkflowState;
  readonly workflow: Workflow;
  /** The run's input and context (the workflow's initial context, with what the run wrote over it). */
  readonly scope: Scope;
  /** ISO time of the input being decided. */
  readonly at: string;
}

/** How a state's work ended, if it did: take the transition for an event, or fail the run. */
export type StateOutcome =
  | { readonly type: "finish"; readonly event: string }
  | { readonly type: "fail"; readonly error: string };

/** What a handler decided: events to append, effects to carry out, and how its work ended. */
export interface StateStep {
  readonly events: readonly DecidedEvent[];
  readonly effects: readonly Effect[];
  readonly outcome?: StateOutcome;
}

/**
 * One state type's behaviour. Each folder in `src/states` exports one, named
 * `<folder>State` from its `state.ts`, and `pnpm discover` lists them in
 * `src/generated/states.ts`. Handlers are pure, like `decide`.
 */
export interface StateHandler<Type extends StateType> {
  readonly type: Type;
  /** The run has just entered the state; `state.entered` is already decided. */
  enter(context: StateContext): StateStep;
  /** An input arrived while the run is in the state. */
  onInput(context: StateContext, input: DecideInput): StateStep;
}

/**
 * Every built state type mapped to its handler. The generated list must
 * satisfy it, so a missing or extra state folder fails typecheck.
 */
export type StateRegistry = { readonly [Type in BuiltStateType]: StateHandler<Type> };

/** A step that changes nothing. */
export const nothing: StateStep = { events: [], effects: [] };
