// What the page checks on the version a start reads, before the engine opens: the workflow or
// agent is there, and the page can run it (`page-refusal.ts`).

import type { WorkflowRef } from "@halonicjs/adapter-workspace-models";
import { filesOf, type LoadedWorkspace, runDefinitionsOf } from "@halonicjs/workspace";
import {
  agentRefusalOf,
  type PageRuns,
  routineRefusalOf,
  workflowRefusalOf,
} from "./page-refusal.ts";

/**
 * Refuses a workflow of `workspace` the page can't run: one with an agent that lists a connector
 * it can't start, or an agent in a harness when no agent host runs.
 *
 * @throws StartRefused naming the agent, with the next step
 * @throws RangeError when the hub or the workflow doesn't exist
 */
export function refuseWorkflowOn(
  workspace: LoadedWorkspace,
  run: WorkflowRef,
  runs: PageRuns,
): void {
  runDefinitionsOf(workspace, run.hubId, run.workflowId);
  const refusal = workflowRefusalOf(workspace, run, runs);
  if (refusal !== undefined) throw refusal;
}

/**
 * Refuses a routine's workflow as {@link refuseWorkflowOn} does, with the step a routine's start
 * gives for a connector the page can't start (`routineRefusalOf`).
 *
 * @throws KindedError `unavailable` with the `routines watch` step, or what
 *   {@link refuseWorkflowOn} throws otherwise
 */
export function refuseRoutineWorkflowOn(
  workspace: LoadedWorkspace,
  run: WorkflowRef,
  runs: PageRuns,
): void {
  try {
    refuseWorkflowOn(workspace, run, runs);
  } catch (error) {
    throw routineRefusalOf(error);
  }
}

/**
 * Refuses an agent of `workspace` a routine starts on its own that the page can't run, as
 * {@link refuseWorkflowOn} refuses a workflow's agents.
 *
 * @throws WindowCantStart naming the agent, with the Harness page step for an agent in a harness
 * @throws RangeError when the hub has no such agent
 */
export function refuseAgentOn(
  workspace: LoadedWorkspace,
  { hubId, agentId }: { readonly hubId: string; readonly agentId: string },
  runs: PageRuns,
): void {
  const file = filesOf(workspace, "agent").find(
    (agent) => agent.hub === hubId && agent.value.id === agentId,
  );
  if (file === undefined) {
    throw new RangeError(`The hub "${hubId}" has no agent "${agentId}".`);
  }
  const refusal = agentRefusalOf(workspace, hubId, file.value, runs);
  if (refusal !== undefined) throw refusal;
}
