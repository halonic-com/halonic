import type { RunVersion } from "@halonicjs/events";
import {
  DEFAULT_TICK_POLICY,
  type DueRun,
  dueWithSkips,
  type PlacedRoutine,
  routineKey,
  routineStart,
  type TickPolicy,
} from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import {
  RoutineScheduler,
  type RoutineSchedulerOptions,
  type RoutineStart,
} from "./routine-scheduler.ts";

/** What {@link workspaceRoutineScheduler} needs: the scheduler's options without the routines logic. */
export interface WorkspaceRoutineSchedulerOptions
  extends Omit<RoutineSchedulerOptions, "due" | "startOf" | "overlapOf" | "keyOf" | "policy"> {
  /**
   * The zone, grace period, catch-up cap and catch-up window. Default: `DEFAULT_TICK_POLICY`,
   * whose zone is UTC; a host passes the machine's zone, which core can't read.
   */
  policy?: TickPolicy;
  /**
   * The version of the workspace a routine run reads, asked as each
   * workflow run starts and recorded on its `run.started`, such as
   * `LiveRoutines.runVersion` (requirement `app.run-records-its-version`).
   * Give the version of the files the executor's `definitionsOf` reads.
   * Not recorded when absent or `null`.
   */
  runVersion?: () => Promise<RunVersion | null>;
}

/**
 * The routine scheduler of a workspace, with the tick function `dueWithSkips` of
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
    keyOf: routineKey,
    due: dueWithSkips,
    startOf: async (run, lastRun) => withVersion(startOfDueRun(run, lastRun), options.runVersion),
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

/** A workflow start with the version its run reads; an agent's start is as it was. */
async function withVersion(
  start: RoutineStart,
  runVersion: WorkspaceRoutineSchedulerOptions["runVersion"],
): Promise<RoutineStart> {
  if (!("workflow" in start) || runVersion === undefined) {
    return start;
  }
  const version = await runVersion();
  return version === null ? start : { workflow: { ...start.workflow, version } };
}

/**
 * Every routine file of a loaded workspace, with the hub it sits in (`null`
 * at the workspace root): what the routine scheduler's `routines` returns. A
 * file that didn't parse isn't among them. A routine whose target is wrong
 * is still there: its start fails on its own and is reported, so it never
 * holds the other routines back.
 *
 * @example
 * routines: async () => placedRoutines(await loadWorkspace(source)),
 */
export function placedRoutines(workspace: LoadedWorkspace): PlacedRoutine[] {
  return filesOf(workspace, "routine").map((file) => ({ hub: file.hub, routine: file.value }));
}
