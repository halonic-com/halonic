import {
  DEFAULT_TICK_POLICY,
  type DueRun,
  due,
  type PlacedRoutine,
  routineStart,
  type TickPolicy,
} from "@halonicjs/routines";
import {
  RoutineScheduler,
  type RoutineSchedulerOptions,
  type RoutineStart,
} from "./routine-scheduler.ts";

/** What {@link workspaceRoutineScheduler} needs: the scheduler's options without the routines logic. */
export interface WorkspaceRoutineSchedulerOptions
  extends Omit<RoutineSchedulerOptions, "due" | "startOf" | "overlapOf" | "policy"> {
  /**
   * The zone, grace period and catch-up cap. Default: `DEFAULT_TICK_POLICY`,
   * whose zone is UTC; a host passes the machine's zone, which core can't read.
   */
  policy?: TickPolicy;
}

/**
 * The routine scheduler of a workspace, with the tick function `due` of
 * `@halonicjs/routines`, each routine's `overlap` setting, and
 * {@link startOfDueRun}, which fills in the `{{trigger.at}}` and
 * `{{trigger.lastRun}}` placeholders.
 *
 * @example
 * const scheduler = workspaceRoutineScheduler({
 *   workspaceId, clock, coordination, executor, runs: runStore, events: scope.events,
 *   routines: loadRoutines, // the host's: every routine file, each with its hub
 *   policy: { ...DEFAULT_TICK_POLICY, timeZone: "Europe/Amsterdam" },
 * });
 * scheduler.onTick("2026-11-03T08:00:00Z");
 */
export function workspaceRoutineScheduler(
  options: WorkspaceRoutineSchedulerOptions,
): RoutineScheduler<PlacedRoutine, TickPolicy, DueRun> {
  return new RoutineScheduler({
    ...options,
    policy: options.policy ?? DEFAULT_TICK_POLICY,
    due,
    startOf: startOfDueRun,
    overlapOf: (run) => run.placed.routine.overlap,
  });
}

/**
 * What to start for a due run: `routineStart` of `@halonicjs/routines`, in
 * the shape the `RunExecutor` takes.
 *
 * @throws Error when the target has no hub: a routine at the workspace level
 *   that doesn't name one in `run.hub`
 */
export function startOfDueRun(run: DueRun, lastRun: Date | null): RoutineStart {
  const start = routineStart(run.placed, { at: run.at, lastRun });
  if (start.hub === null) {
    throw new Error(`Routine ${run.key} runs outside a hub, so it must name one in run.hub.`);
  }
  if ("workflow" in start) {
    return { workflow: { hubId: start.hub, workflowId: start.workflow, input: start.input } };
  }
  return { agent: { hubId: start.hub, agentId: start.agent, prompt: start.prompt } };
}
