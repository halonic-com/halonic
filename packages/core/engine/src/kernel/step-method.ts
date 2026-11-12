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

/** The state types whose `method` their agent calls; a `parallel` state's branches name their own. */
const methodStates: ReadonlySet<string> = new Set(["task", "foreach"]);

/**
 * The method a run's model call for `stateId` calls: the state's `method`
 * of the call's agent, from the definitions the run started with.
 * `undefined` when the state calls none.
 */
export function callMethodOf(
  definitions: RunDefinitions,
  stateId: string,
  agentId: string,
): AgentMethod | undefined {
  const states = definitions.workflow.states;
  const state = Object.hasOwn(states, stateId) ? states[stateId] : undefined;
  if (state?.method === undefined || !methodStates.has(state.type)) return undefined;
  return methodOf(definitions.agents ?? {}, agentId, state.method);
}

/** A method's answer as an agent's `output` says it: text, or JSON for a method that answers with fields. */
export function methodOutputOf(method: AgentMethod): AgentOutput {
  return method.output === "text" ? { type: "text" } : { type: "json" };
}

/**
 * The output a step's answer is checked against in place of its agent's
 * (HAL-7037): the step's own `format` first, then the `output` of the
 * method it calls. `undefined` when the step has neither, so the agent's
 * own output counts.
 */
export function stepOutputOf(
  format: WorkflowState["format"],
  method: AgentMethod | undefined,
): AgentOutput | undefined {
  if (format !== undefined) return { type: format };
  return method === undefined ? undefined : methodOutputOf(method);
}

/** Why a step can't call `name`: its agent has no such method. */
export function noMethodError(stateId: string, agentId: string, name: string): string {
  return `State "${stateId}" calls method "${name}", which agent "${agentId}" doesn't have.`;
}
