// The routines of the page's engine (HAL-14205): the routine scheduler
// `halonic routines watch` runs, on the engine's own tick, so the
// workspace's routines start on time while the window is open. It is built
// with the engine and stops when the engine closes.
//
// The page's engine starts every run from the saved files it loaded and
// checked for trust (`studio.engine-service`), so its routines come from the
// saved files too: `LiveRoutines` without version control, read again on
// every tick, so turning a routine off counts by the next one. Each start
// goes through the page's own checks first, as Run does.

import { LiveRoutines, workspaceRoutineScheduler } from "@halonicjs/app";
import type { RoutineTickResult } from "@halonicjs/app/routines";
import type { RoutineEngine, RoutineTicks } from "@halonicjs/engine";
import type { DefinitionSource, RunExecutor, StartRunRequest } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link pageRoutines} reads of the engine service's options. */
export interface PageRoutinesOptions {
  /** The workspace folder, whose name stands in for an id `workspace.yaml` doesn't give. */
  readonly location: string;
  /** The saved files, which the routines are read from on every tick. */
  readonly definitions: DefinitionSource;
  /** The zone of a schedule that names none: the computer's own. */
  readonly timeZone: string;
  /** Hears what a tick couldn't do, such as a routine whose run didn't start. */
  reportError(error: unknown): void;
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
  const live = new LiveRoutines({ vcs: null, saved: options.definitions });
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
        policy: { ...DEFAULT_TICK_POLICY, timeZone: options.timeZone },
      });
      tick = async () => reportFailures(await scheduler.tick(), options.reportError);
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

/** Passes on each due time a tick couldn't start or record. */
function reportFailures(result: RoutineTickResult, reportError: (error: unknown) => void): void {
  for (const failure of [...result.failed, ...result.lastRunNotSaved]) reportError(failure.error);
  for (const failure of result.skipsNotSaved) reportError(failure.error);
}

/**
 * The workspace's id from `workspace.yaml`, the same on every computer, or the folder's name when
 * it gives none: the rule of `halonic routines watch`, so both name the workspace the same.
 */
function workspaceIdOf(workspace: LoadedWorkspace, location: string): string {
  const folderName = location.split(/[\\/]/).filter(Boolean).at(-1) ?? location;
  return filesOf(workspace, "workspace")[0]?.value.id ?? folderName;
}
