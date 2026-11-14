// The engine of one workspace as the CLI and the desktop Studio put it
// together (HAL-8792): the executor on a scheduler of run timers, the
// routines on the engine's own parts, and the order everything closes in.
// It touches no store, scheduler or lock itself: the host passes the ones of
// its runtime (Node's in the CLI, Tauri's in the Studio), so this stays free
// of `node:*`, which the core layer's check already enforces.

import type {
  Clock,
  Coordination,
  RunStore,
  ScheduledTimer,
  Scheduler,
  SchedulerListener,
} from "@halonicjs/ports";
import { LocalExecutor } from "./local-executor.ts";
import type { LocalExecutorOptions } from "./local-executor-options.ts";
import type { LocalRunsOptions } from "./run/local-runs-options.ts";

/** What the routine scheduler is built on: the engine's own parts. */
export interface RoutineEngine {
  readonly executor: LocalExecutor;
  readonly runs: RunStore;
  readonly clock: Clock;
  /** Kept by the host so the last tick and queues survive a restart. */
  readonly coordination: Coordination;
}

/** The routine scheduler as the engine drives it, such as `RoutineScheduler` of `@halonicjs/app`. */
export interface RoutineTicks {
  onTick(at: string): Promise<void>;
  /** Stops it starting runs, once a tick in progress has settled; called first when the engine closes. */
  dispose(): Promise<void>;
}

/** What {@link assembleEngine} puts together. */
export interface EngineAssemblyOptions {
  /** Makes the scheduler of the run timers, with the engine's listener; the runtime's own. */
  createScheduler(listener: SchedulerListener): Scheduler & { close(): Promise<void> };
  /** The executor's options. Its runs get the scheduler made here. */
  readonly executor: Omit<LocalExecutorOptions, "runs"> & {
    readonly runs: Omit<LocalRunsOptions, "scheduler">;
  };
  /** What the routines share between ticks; the runtime's own store behind it. */
  readonly coordination: Coordination;
  /**
   * Starts the routines on the scheduler's tick. Left out, a tick does
   * nothing, as for `halonic run`.
   */
  readonly routines?: (engine: RoutineEngine) => RoutineTicks;
  /**
   * Whether to leave a timer untried: it fails at once, and the scheduler
   * keeps it, so the next engine on the workspace tries it again.
   */
  holdsTimer?(timer: ScheduledTimer): boolean;
  /** Hears each timer the executor handled. */
  onTimerDone?(timer: ScheduledTimer): void;
  /**
   * What the host closes after the scheduler, in this order: connectors,
   * program copies, the harness host. Each one runs even when an earlier one
   * failed, and the first failure is thrown once all have run.
   */
  readonly closers?: readonly (() => Promise<void>)[];
  /** Releases the host's lock on the workspace; last, so no other engine opens while a timer is delivered. */
  release(): Promise<void>;
}

/** The engine {@link assembleEngine} built, open until {@link AssembledEngine.close}. */
export interface AssembledEngine {
  readonly executor: LocalExecutor;
  readonly runs: RunStore;
  readonly clock: Clock;
  readonly coordination: Coordination;
  /**
   * Stops the routines, closes the executor, then the scheduler (which waits
   * for the step in progress), then the host's closers, then releases the
   * lock. A run still going stays in the run store, and the next engine on
   * the workspace moves it on from its timers. Safe to call twice.
   */
  close(): Promise<void>;
  /** Releases the lock now, for a process that ends straight after a `close` that hangs (HAL-6677). */
  abandon(): Promise<void>;
}

/**
 * Builds the executor on a scheduler of run timers, then the routines, and
 * returns the engine that closes them in order.
 *
 * @example
 * const engine = assembleEngine({ createScheduler, executor, coordination, release: () => lock.release() });
 * await engine.close();
 */
export function assembleEngine(options: EngineAssemblyOptions): AssembledEngine {
  // The scheduler's listener needs the executor, and the executor needs the
  // scheduler, so the listener looks it up when it is called.
  let executor: LocalExecutor | undefined;
  let routines: RoutineTicks | undefined;
  const scheduler = options.createScheduler({
    onTimer: async (timer) => {
      if (executor === undefined) {
        // The scheduler retries the timer once the executor is there.
        throw new Error("The engine is still starting; the timer is tried again.");
      }
      if (options.holdsTimer?.(timer) === true) {
        // Rejected, not resolved: the scheduler would remove a timer that resolved.
        throw new Error("The watch gave up on this run; its timer waits for the next engine.");
      }
      await executor.onTimer(timer);
      options.onTimerDone?.(timer);
    },
    // A tick before the routines are built is missed; the next one catches up.
    onTick: async (at) => {
      await routines?.onTick(at);
    },
  });
  const { runs, ...rest } = options.executor;
  const opened = new LocalExecutor({ ...rest, runs: { ...runs, scheduler } });
  executor = opened;
  const { clock } = rest;
  const { coordination } = options;
  routines = options.routines?.({ executor: opened, runs: runs.store, clock, coordination });
  const ticks = routines;
  let closing: Promise<void> | undefined;
  return {
    executor: opened,
    runs: runs.store,
    clock,
    coordination,
    close: () => {
      closing ??= (async () => {
        try {
          // First, so no routine run starts on an executor that is closing.
          await ticks?.dispose();
          try {
            // Before the scheduler: its close waits for the deliveries in progress.
            await opened.close();
            await scheduler.close();
          } finally {
            await closeAll(options.closers ?? []);
          }
        } finally {
          await options.release();
        }
      })();
      return closing;
    },
    // Safe while the close still runs: a lock's release is safe to call twice.
    abandon: () => options.release(),
  };
}

/** Runs every closer, even after one failed, and throws the first failure at the end. */
async function closeAll(closers: readonly (() => Promise<void>)[]): Promise<void> {
  const failures: unknown[] = [];
  for (const close of closers) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw failures[0];
  }
}
