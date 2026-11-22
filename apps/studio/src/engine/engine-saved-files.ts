// What an open engine reads of the workspace (`studio.engine-service`, HAL-16324): the files as
// they were saved when a start, an answer or a routine's start last asked, not as they
// were when the engine opened. Definitions, models, chat turns, the budget and the trust checks
// read that copy. Local only is built into the engine's executor and harness host, so a save that
// turns it on or off needs a new engine, as `halonic routines watch` does (HAL-6084): the copy is
// kept as it was, and the service opens a new engine or refuses.

import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { LocalExecutor } from "@halonicjs/engine";
import { KindedError } from "@halonicjs/std";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** The workspace an open engine reads, as saved at its latest start or answer. */
export class SavedWorkspace {
  #current: LoadedWorkspace;
  /** Whether the engine was built local only; it stays so while the engine is open. */
  readonly localOnly: boolean;

  /** @param opened the workspace the engine was built on */
  constructor(opened: LoadedWorkspace) {
    this.#current = opened;
    this.localOnly = isLocalOnly(opened);
  }

  /** The files as last taken, which the engine's runs read. */
  readonly latest = (): LoadedWorkspace => this.#current;

  /**
   * Takes `saved` as the files the engine reads from now on, unless it turns local only on or off.
   *
   * @returns whether it was taken; when not, the engine must not start anything more
   */
  take(saved: LoadedWorkspace): boolean {
    if (isLocalOnly(saved) !== this.localOnly) return false;
    this.#current = saved;
    return true;
  }
}

/** Whether the workspace is local only; without a workspace.yaml that parsed, the format's default: no. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

/**
 * Refuses, while a run is going in the engine, to close it for a new local only: closing would
 * stop that run. A run waiting for a person or a timer goes on in the next engine.
 *
 * @throws KindedError `unavailable`, so the page offers to try again, when a run is going
 */
export async function refuseWhileRunsGo(
  executor: LocalExecutor,
  runs: TauriRunStore,
  name: string,
): Promise<void> {
  if (!(await hasRunGoing(executor, runs))) return;
  throw localOnlyChangedRefusal(name, "Try again once the run that's going ends.");
}

/**
 * Whether a run is going in the engine, not waiting for a person or a timer. First the executor
 * ends the runs a previous engine lost, which its store still lists as running until then.
 *
 * @param executor the engine's executor; none before the engine is built, when no run goes in it
 */
export async function hasRunGoing(
  executor: LocalExecutor | undefined,
  runs: TauriRunStore,
): Promise<boolean> {
  if (executor === undefined) return false;
  await executor.endLostRuns();
  const going = await runs.list({ status: ["running"] });
  return going.length > 0;
}

/**
 * The refusal of a start the open engine can't make because local only was turned on or off.
 *
 * @param fix the next step: trying again for a person's start, the next time for a routine's
 */
export function localOnlyChangedRefusal(name: string, fix: string): KindedError {
  return new KindedError(
    "unavailable",
    `Local only was turned on or off in ${name}, so this run didn't start.`,
    { fix },
  );
}

/** The next step of a routine's start refused for a new local only. */
export const routineLocalOnlyStep = "It starts at its next time, once no run is going.";
