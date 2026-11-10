// The local executor and the routine scheduler of its workspace on one
// scheduler. `app` can't import the engine, so every host that runs the
// engine in its own process (Studio services, the CLI) puts them together here.

import {
  type RoutineScheduler,
  type WorkspaceRoutineSchedulerOptions,
  workspaceRoutineScheduler,
} from "@halonicjs/app";
import type { Scheduler, SchedulerListener } from "@halonicjs/ports";
import { LocalExecutor, type LocalExecutorOptions } from "./local-executor.ts";
import type { LocalRunsOptions } from "./run/local-runs-options.ts";

/** A scheduler the host may stop, such as `NodeScheduler`, whose `close` waits for its deliveries. */
export type LocalEngineScheduler = Scheduler & { close?(): Promise<void> };

/** What {@link localEngine} needs. */
export interface LocalEngineOptions<S extends LocalEngineScheduler> {
  /**
   * Makes the scheduler that wakes the runs and ticks the routines, with the
   * listener given, such as `nodeSchedulerFactory(…)` of scheduler-node.
   */
  createScheduler(listener: SchedulerListener): S;
  /** The executor's options. Its runs get the scheduler made here. */
  executor: Omit<LocalExecutorOptions, "runs"> & { runs: Omit<LocalRunsOptions, "scheduler"> };
  /**
   * The workspace's routine scheduler, without what comes from the
   * executor: it starts the runs, its run store tells which are still
   * going, and its clock gives the time.
   */
  routines: Omit<WorkspaceRoutineSchedulerOptions, "executor" | "runs" | "clock">;
}

/** The local executor with the routine scheduler of its workspace. */
export interface LocalEngine<S extends LocalEngineScheduler> {
  readonly executor: LocalExecutor;
  readonly scheduler: S;
  readonly routines: RoutineScheduler;
  /**
   * Stops starting routine runs and waits for a tick in progress, then
   * closes the executor, then the scheduler if it can be closed. Closing the
   * executor stops every harness run with its session and bridge, so the
   * scheduler isn't left waiting for a delivery that never ends. Other runs
   * that are going stay in the run store, and the next engine moves them on
   * from their timers; the stopped harness runs end as `interrupted`.
   */
  close(): Promise<void>;
}

/**
 * Builds the local executor and the workspace's routine scheduler on one
 * scheduler: its timers go to the executor, which moves a run on one step
 * per timer, and its ticks go to the routine scheduler, which starts the
 * routine runs that are due through the executor.
 *
 * @example
 * const engine = localEngine({
 *   createScheduler: nodeSchedulerFactory({ store, clock, setTimer: systemSetTimer, reportError }),
 *   executor: { resolveModel, halonicTools, connectors, secrets, clock, runs: { store: runStore, blobs, ids, definitionsOf } },
 *   routines: { workspaceId, coordination, routines: loadRoutines, events: scope.events, policy },
 * });
 * // When the workspace closes:
 * await engine.close();
 */
export function localEngine<S extends LocalEngineScheduler>(
  options: LocalEngineOptions<S>,
): LocalEngine<S> {
  // The listener needs the executor and the routine scheduler, and they need
  // the scheduler, so it looks them up when the scheduler calls it.
  let executor: LocalExecutor | undefined;
  let routines: RoutineScheduler | undefined;
  const scheduler = options.createScheduler({
    onTimer: async (timer) => {
      await ready(executor).onTimer(timer);
    },
    onTick: async (at) => {
      await ready(routines).onTick(at);
    },
  });
  const { runs, ...rest } = options.executor;
  executor = new LocalExecutor({ ...rest, runs: { ...runs, scheduler } });
  routines = workspaceRoutineScheduler({
    ...options.routines,
    clock: rest.clock,
    executor,
    runs: runs.store,
  });
  const built = { executor, scheduler, routines };
  return {
    ...built,
    close: async () => {
      await built.routines.dispose();
      // Before the scheduler: its close waits for the deliveries in progress,
      // and a harness run's delivery ends only once the harness run stops.
      await built.executor.close();
      await built.scheduler.close?.();
    },
  };
}

/**
 * The executor or routine scheduler once {@link localEngine} has built it.
 * A scheduler that calls its listener while it is being made gets an error:
 * it retries the timer, and the next tick catches up.
 */
function ready<T>(built: T | undefined): T {
  if (built === undefined) {
    throw new Error("The local engine is still starting; try again on the next timer or tick.");
  }
  return built;
}
