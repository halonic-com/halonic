// A step with `method` calls one of its agent's methods (HAL-4757). The
// decider and the executor each read the method from the step's definition
// and the agent's file, so neither the run log nor the call effects carry it:
// a resumed call finds the same method the first call used.

import type { Agent, AgentMethod, AgentOutput, WorkflowState } from "@halonicjs/format";
import type { RunDefinitions } from "./decide-types.ts";

/**
 * The method `name` of the agent, or `undefined` when the agent has no
 * file among the run's definitions or no method by that name.
 */
export function methodOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
  name: string,
): AgentMethod | undefined {
  const methods = Object.hasOwn(agents, agentId) ? agents[agentId]?.methods : undefined;
  return methods !== undefined && Object.hasOwn(methods, name) ? methods[name] : undefined;
}

/** The state types whose own `method` their agent calls; a `parallel` state's branches name their own. */
const methodStates: ReadonlySet<string> = new Set(["task", "foreach"]);

/**
 * What a step says about how its agent answers: a `task` or `foreach`
 * state, or a `parallel` branch (which has a `method` and no `format`).
 */
export type MethodStep = Pick<WorkflowState, "method" | "format">;

/**
 * The method a run's model call for `stateId` calls: the step's `method`
 * of the call's agent, from the definitions the run started with.
 * `branch` names the branch of a `parallel` state the call belongs to.
 * `undefined` when the step calls none.
 */
export function callMethodOf(
  definitions: RunDefinitions,
  stateId: string,
  agentId: string,
  branch?: string,
): AgentMethod | undefined {
  const step = callStepOf(definitions, stateId, branch);
  if (step?.method === undefined) return undefined;
  return methodOf(definitions.agents ?? {}, agentId, step.method);
}

/**
 * The step of the run's workflow that a model call for `stateId` belongs
 * to, when it is one whose own `method` and `format` count: a `task` or a
 * `foreach` state, or the `branch` of a `parallel` state. `undefined` for
 * any other.
 */
export function callStepOf(
  definitions: RunDefinitions,
  stateId: string,
  branch?: string,
): MethodStep | undefined {
  const states = definitions.workflow.states;
  const state = Object.hasOwn(states, stateId) ? states[stateId] : undefined;
  if (state === undefined) return undefined;
  if (branch !== undefined) {
    const branches = state.branches ?? {};
    return state.type === "parallel" && Object.hasOwn(branches, branch)
      ? branches[branch]
      : undefined;
  }
  return methodStates.has(state.type) ? state : undefined;
}

/** A method's answer as an agent's `output` says it: text, or JSON for a method that answers with fields. */
export function methodOutputOf(method: AgentMethod): AgentOutput {
  return method.output === "text" ? { type: "text" } : { type: "json" };
}

/** Why a `parallel` state's branch can't call `name`: its agent has no such method. */
export function noBranchMethodError(
  stateId: string,
  branch: string,
  agentId: string,
  name: string,
): string {
  return `Branch "${branch}" of parallel state "${stateId}" calls method "${name}", which agent "${agentId}" doesn't have.`;
}

/** Why a step can't call `name`: its agent has no such method. */
export function noMethodError(stateId: string, agentId: string, name: string): string {
  return `State "${stateId}" calls method "${name}", which agent "${agentId}" doesn't have.`;
}
