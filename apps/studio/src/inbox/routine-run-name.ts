import type { RunSummary } from "@halonicjs/events";

/** What a routine's run is named by: the workspace's routines and workflows, as last read. */
export interface RoutineRunNames {
  /** The routine by its key, the `trigger.routineId` of its runs; `undefined` when it is gone. */
  routine(key: string): { readonly name: string } | undefined;
  /** The workflow by its hub and id; `undefined` when it is gone. */
  workflow(hubId: string, workflowId: string): { readonly name: string } | undefined;
}

/**
 * What the Inbox calls a routine's run (HAL-11190): the routine's name, or the name of the
 * workflow it ran when the routine is gone, as the Runs list names a run. Never the routine's key.
 *
 * @example
 * routineRunName(runs, summary); // "Daily summary"
 */
export function routineRunName(names: RoutineRunNames, run: RunSummary): string {
  const key = run.trigger?.routineId;
  const routine = key === undefined ? undefined : names.routine(key);
  return routine?.name ?? names.workflow(run.hubId, run.workflowId)?.name ?? run.workflowId;
}
