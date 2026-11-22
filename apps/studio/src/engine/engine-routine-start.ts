import type { RunVersion } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import type { EngineService, RoutineRunStart } from "./engine-service.ts";
import { agentStartRefusalOf } from "./page-refusal.ts";

/** The page runs the workspace's files as they are saved: it makes no copy at a commit. */
export const savedFiles: RunVersion = { reads: "saved-files" };

/**
 * Starts what a routine runs on `engine`, for its Run now: a workflow is checked as
 * {@link EngineService.startRun} checks it, an agent as {@link EngineService.checkAgent} checks
 * it, both before the engine opens. The run records a manual trigger that names the routine, so
 * the routine finds its own runs again.
 *
 * @param trigger the routine's key and the time the person asked for the run
 * @returns the new run's id
 * @throws WindowCantStart when the target is an agent, because agent runs aren't built yet
 *   ({@link agentStartRefusalOf}), or what {@link EngineService.startRun} throws
 */
export async function startRoutineOn(
  engine: Pick<EngineService, "check" | "checkAgent" | "openForStart">,
  start: RoutineRunStart,
  trigger: { readonly routineKey: string; readonly at: string },
): Promise<{ readonly id: string }> {
  const runTrigger = { type: "manual" as const, routineId: trigger.routineKey, at: trigger.at };
  if ("workflow" in start) {
    const { hubId, workflowId } = start.workflow;
    await engine.check({ hubId, workflowId });
    const { executor } = await engine.openForStart();
    const { id } = await executor.start({
      ...start.workflow,
      trigger: runTrigger,
      version: savedFiles,
    });
    return { id };
  }
  await engine.checkAgent(start.agent);
  // As the port: the local executor's own `startAgent` takes no request until agent runs are built.
  const executor: RunExecutor = (await engine.openForStart()).executor;
  try {
    const { id } = await executor.startAgent({ ...start.agent, trigger: runTrigger });
    return { id };
  } catch (error) {
    throw agentStartRefusalOf(error);
  }
}
