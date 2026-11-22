// The routines of the page's engine (HAL-14205): the routine scheduler
// `halonic routines watch` runs, on the engine's own tick, so the
// workspace's routines start on time while the window is open. It is built
// with the engine and stops when the engine closes.
//
// The routines come from the live version, as `halonic routines watch` reads
// them (`app.scheduler-live-routines`, HAL-14229): `LiveRoutines` over the
// page's reader of the live version, so a saved change to a routine counts
// only once it is made live, and a routine that has never been live isn't
// scheduled. On and Off come from the saved files, read again on every tick,
// so turning a routine off counts by the next one. With history off,
// everything comes from the saved files. Each start goes through the page's
// own checks first, as Run does, on the version its run records.

import { LiveRoutines, workspaceRoutineScheduler } from "@halonicjs/app";
import { type RoutineTickResult, type SkipRecord, SkipRecords } from "@halonicjs/app/routines";
import type { AssembledEngine, RoutineEngine, RoutineTicks } from "@halonicjs/engine";
import type { DefinitionSource, RunExecutor, StartRunRequest } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { LiveVersions } from "./page-versions.ts";

/** What {@link pageRoutines} reads of the engine service's options. */
export interface PageRoutinesOptions {
  /** The workspace folder, whose name stands in for an id `workspace.yaml` doesn't give. */
  readonly location: string;
  /** The saved files, which each routine's On and Off is read from on every tick. */
  readonly definitions: DefinitionSource;
  /** The workspace's live version, which the routines come from; left out, history is off. */
  readonly versions?: LiveVersions | undefined;
  /** The zone of a schedule that names none: the computer's own. */
  readonly timeZone: string;
  /** Hears what a tick couldn't do, such as a routine whose run didn't start. */
  reportError(error: unknown): void;
  /** Hears that a tick added to a routine's skip records, as a refused start does, which starts no run. */
  onSkipsSaved?(): void;
}

/** The routines on the engine's tick, and the tick that catches up as soon as the engine opens. */
export interface PageRoutines {
  /** For `assembleEngine`'s `routines`. */
  readonly ticks: (engine: RoutineEngine) => RoutineTicks;
  /** Starts what was due while no engine ran, once the engine is built. */
  catchUp(): Promise<void>;
}

/**
 * The workspace's routine scheduler for the page's engine, as `halonic routines watch` builds it:
 * the same workspace id, so the CLI and the Studio share one last tick and never start a time
 * twice, and the computer's zone.
 *
 * @param workspace - the workspace the engine loaded, for its id
 * @param beforeStart - what the page checks before a routine's workflow starts, as before Run:
 *   what it can't run, and whether the workspace may start anything now
 */
export function pageRoutines(
  workspace: LoadedWorkspace,
  options: PageRoutinesOptions,
  beforeStart: (request: StartRunRequest) => Promise<void>,
): PageRoutines {
  const live = new LiveRoutines({ vcs: options.versions ?? null, saved: options.definitions });
  let tick: (() => Promise<void>) | undefined;
  // The scheduler drops a tick that comes while another runs, so a wake-up during the catch-up
  // (a computer waking from sleep as the window opens) waits for it instead of being lost.
  let catchingUp: Promise<void> = Promise.resolve();
  return {
    ticks: (engine) => {
      const scheduler = workspaceRoutineScheduler({
        workspaceId: workspaceIdOf(workspace, options.location),
        clock: engine.clock,
        coordination: engine.coordination,
        executor: checkedExecutor(engine.executor, beforeStart),
        runs: engine.runs,
        routines: () => live.list(),
        targetUnavailable: (run) => live.targetUnavailable(run),
        // The version each routine run records, whose definitions the engine starts it from.
        runVersion: () => live.runVersion(),
        policy: { ...DEFAULT_TICK_POLICY, timeZone: options.timeZone },
      });
      tick = async () => {
        const result = await scheduler.tick();
        reportFailures(result, options.reportError);
        if (result.skipsSaved.length > 0) options.onSkipsSaved?.();
      };
      const ticked = tick;
      const onTick = async () => {
        // The catch-up's own failure is its caller's to report.
        await catchingUp.catch(() => undefined);
        await ticked();
      };
      return { onTick, dispose: () => scheduler.dispose() };
    },
    catchUp: () => {
      catchingUp = tick?.() ?? Promise.resolve();
      return catchingUp;
    },
  };
}

/** The engine's executor, as the scheduler starts runs on it, with the page's checks before a workflow starts. */
function checkedExecutor(
  executor: RunExecutor,
  beforeStart: (request: StartRunRequest) => Promise<void>,
): RunExecutor {
  return {
    id: executor.id,
    start: async (request) => {
      await beforeStart(request);
      return executor.start(request);
    },
    startAgent: (request) => executor.startAgent(request),
    send: (runId, event, payload, sendOptions) => executor.send(runId, event, payload, sendOptions),
    subscribe: (runId, afterSeq, listener) => executor.subscribe(runId, afterSeq, listener),
    chatTurn: (request) => executor.chatTurn(request),
  };
}

/** Who hears that a tick added to a routine's skip records: the routines host, for the open page. */
export class SkipListeners {
  readonly #listeners = new Set<() => void>();

  /** Adds `listener`; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Calls every listener. */
  tell(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Passes on each due time a tick couldn't start or record. */
function reportFailures(result: RoutineTickResult, reportError: (error: unknown) => void): void {
  for (const failure of [...result.failed, ...result.lastRunNotSaved]) reportError(failure.error);
  for (const failure of result.skipsNotSaved) reportError(failure.error);
}

/**
 * A routine's skip records (`app.skip-records`) from the engine's own `Coordination`, for the Runs
 * view; none while no engine is open (or it fails to), since a second `Coordination` on that store
 * would compact it under the engine or the CLI.
 */
export async function routineSkipsOf(
  open:
    | Promise<{ readonly engine: AssembledEngine; readonly workspace: LoadedWorkspace }>
    | undefined,
  location: string,
  routineKey: string,
): Promise<SkipRecord[]> {
  const opened = await open?.catch(() => undefined);
  if (opened === undefined) return [];
  const workspaceId = workspaceIdOf(opened.workspace, location);
  return new SkipRecords(opened.engine.coordination, workspaceId).read(routineKey);
}

/**
 * The workspace's id from `workspace.yaml`, the same on every computer, or the folder's name when
 * it gives none: the rule of `halonic routines watch`, so both name the workspace the same.
 */
function workspaceIdOf(workspace: LoadedWorkspace, location: string): string {
  const folderName = location.split(/[\\/]/).filter(Boolean).at(-1) ?? location;
  return filesOf(workspace, "workspace")[0]?.value.id ?? folderName;
}
