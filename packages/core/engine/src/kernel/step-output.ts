// A step's `format` is "the reply format for this step, instead of the
// agent's own" (E8 in HAL-185's engine bug decisions, HAL-6982). The decider
// checks the answer against it, and the executor tells the model how to
// reply by it, so both read it from the step's definition.

import type { Agent, AgentOutput } from "@halonicjs/format";
import type { RunDefinitions } from "./decide-types.ts";
import { agentIn } from "./kept-definitions.ts";
import { callStepOf, type MethodStep, methodOf, methodOutputOf } from "./step-method.ts";

/**
 * What a step's answer is checked against instead of its agent's own
 * `output`: the step's `format` first, else the `output` of the method the
 * step calls. `undefined` when the step has neither, so the agent's own
 * counts.
 */
export function stepOutputOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
  step: MethodStep,
): AgentOutput | undefined {
  if (step.format !== undefined) return { type: step.format };
  const method = step.method === undefined ? undefined : methodOf(agents, agentId, step.method);
  return method === undefined ? undefined : methodOutputOf(method);
}

/**
 * The agent a run's model call for `stateId` (and `branch` of a `parallel`
 * state) is made as, from the definitions the run started with: its `output` is the step's own
 * ({@link stepOutputOf}) when the step has one, so the model is told to
 * reply as the step asks. `undefined` for an agent the definitions have no
 * file for.
 */
export function callAgentOf(
  definitions: RunDefinitions,
  stateId: string,
  agentId: string,
  branch?: string,
): Agent | undefined {
  const agent = agentIn(definitions, agentId);
  const step = callStepOf(definitions, stateId, branch);
  const stepOutput =
    step === undefined ? undefined : stepOutputOf(definitions.agents ?? {}, agentId, step);
  return agent === undefined || stepOutput === undefined ? agent : { ...agent, output: stepOutput };
}
