// How the page's engine takes the files as saved (`engine-saved-files.ts`, HAL-16324): a start, an
// answer and a routine's start each take them, and a save that turned local only on or off closes
// the engine and opens a new one, or refuses while a run is going, which closing would stop. A
// cancel takes nothing: it starts nothing, so it goes on the open engine as it is.

import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { AssembledEngine, LocalExecutor } from "@halonicjs/engine";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { EngineLockHold } from "./engine-lock.ts";
import {
  hasRunGoing,
  localOnlyChangedRefusal,
  refuseWhileRunsGo,
  routineLocalOnlyStep,
  type SavedWorkspace,
} from "./engine-saved-files.ts";

/** An open engine and the workspace it was built on. */
export interface OpenEngine {
  readonly engine: AssembledEngine;
  /** The workspace as it was when the engine opened; its id names the routines' records. */
  readonly workspace: LoadedWorkspace;
  /** The workspace as saved at the latest start, which the engine's runs read. */
  readonly saved: SavedWorkspace;
  readonly lock: EngineLockHold;
  /** The runs the engine keeps, read before an answer is sent. */
  readonly runs: TauriRunStore;
}

/** What taking the saved files needs of the engine service. */
export interface EngineOpener {
  /** The engine being opened or open now, if any. */
  readonly current: () => Promise<OpenEngine> | undefined;
  /** The open engine, opening it when none is. */
  readonly open: () => Promise<OpenEngine>;
  /** Closes the engine, if open, and gives the workspace's lock back. */
  readonly close: () => Promise<void>;
  /** Reads the workspace's files as saved now. */
  readonly load: () => Promise<LoadedWorkspace>;
  /** The workspace's name, for the refusals. */
  readonly name: string;
  readonly reportError: (error: unknown) => void;
}

/**
 * The open engine on the files as saved now, which its runs read from here on. A save that turned
 * local only on or off closes it and opens a new one.
 *
 * @throws KindedError `unavailable` when local only changed while a run is going, which closing
 *   would stop, or what opening the engine throws
 */
export async function openOnSavedFiles(opener: EngineOpener): Promise<OpenEngine> {
  const opening = opener.open();
  const open = await opening;
  if (open.saved.take(await opener.load())) return open;
  await refuseWhileRunsGo(open.engine.executor, open.runs, opener.name);
  return reopen(opener, opening);
}

/**
 * Takes the saved files for a routine's start, which goes on the engine without
 * {@link openOnSavedFiles}. When local only changed, the start is refused, and the engine opens
 * anew once no run is going: not here, since the scheduler waits for this tick and closing waits
 * for the scheduler, so afterwards, for the next tick.
 *
 * @param executor the engine's executor, once it is built
 * @throws KindedError `unavailable` when local only changed
 */
export async function takeForRoutine(
  opener: EngineOpener,
  saved: SavedWorkspace,
  executor: LocalExecutor | undefined,
  runs: TauriRunStore,
): Promise<void> {
  if (saved.take(await opener.load())) return;
  const opening = opener.current();
  // With a run going, the next tick asks again.
  hasRunGoing(executor, runs)
    .then(async (going) => {
      if (!going && opening !== undefined) await reopen(opener, opening);
    })
    .catch(opener.reportError);
  throw localOnlyChangedRefusal(opener.name, routineLocalOnlyStep);
}

/** Closes the engine `opening` opened, unless another call did already, and opens a new one. */
async function reopen(opener: EngineOpener, opening: Promise<OpenEngine>): Promise<OpenEngine> {
  if (opener.current() === opening) await opener.close();
  return opener.open();
}
