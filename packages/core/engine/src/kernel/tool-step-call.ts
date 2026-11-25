// A `tool` state's check before its call (requirement `engine.tool-state`):
// the same check an agent's call to that tool gets, which only the
// connector's listing can finish, so the executor makes it. The run log
// records nothing for the check, which only reads, so the executor works out
// what to check from the run and the definitions it started with, as the
// state does.

import { childInput, getState } from "@halonicjs/workflow";
import type { RunDefinitions } from "./decide-types.ts";
import type { RunState } from "./run-state.ts";

/**
 * Check the call of the `tool` state the run is in, as an agent's call to
 * that tool is checked. The executor reads the call with
 * {@link toolStepCallOf}, so a check made again after a restart checks the
 * same call.
 */
export interface CheckToolEffect {
  readonly type: "check-tool";
  readonly callId: string;
  readonly state: string;
}

/**
 * What the check found: `run` makes the call, `ask` waits for a person's OK
 * first, and `refused` fails the run with `reason`. `name` is the tool's name
 * as a model is offered it, which the call goes to.
 */
export type ToolCheckResult =
  | { readonly type: "tool-check"; readonly kind: "run" | "ask"; readonly name: string }
  | { readonly type: "tool-check"; readonly kind: "refused"; readonly reason: string };

/** What one tool step calls: the connector, the tool as its server lists it, and the arguments. */
export interface ToolStepCall {
  readonly callId: string;
  readonly state: string;
  readonly connector: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

/**
 * The call id of a visit's check: the visit's `seq` makes it unique in the
 * run, as a rule's is, with no id generator.
 */
export function toolCheckCallId(enteredSeq: number): string {
  return `tool-check-${enteredSeq}`;
}

/**
 * The tool step's call, with its `with` rendered against the scope `decide`
 * gives the state, which nothing changes while the step runs.
 */
export function toolStepArgs(
  run: RunState,
  definitions: Pick<RunDefinitions, "workflow">,
  stateId: string,
): Record<string, unknown> {
  const { workflow } = definitions;
  const state = getState(workflow, stateId);
  const scope = { input: run.input, context: { ...workflow.context, ...run.context } };
  return childInput(state.with, scope);
}

/**
 * The call the run's check under `callId` is for, or `null` when the run
 * waits on no such check: it has moved on, ended, waits, or has already
 * asked for the call.
 */
export function toolStepCallOf(
  run: RunState,
  definitions: RunDefinitions,
  callId: string,
): ToolStepCall | null {
  const { workflow } = definitions;
  if (run.status !== "running" || run.state === null || run.enteredSeq === null) return null;
  if (run.effect !== null || callId !== toolCheckCallId(run.enteredSeq)) return null;
  if (!Object.hasOwn(workflow.states, run.state)) return null;
  const state = getState(workflow, run.state);
  if (state.type !== "tool" || state.connector === undefined || state.tool === undefined) {
    return null;
  }
  return {
    callId,
    state: run.state,
    connector: state.connector,
    tool: state.tool,
    args: toolStepArgs(run, definitions, run.state),
  };
}
