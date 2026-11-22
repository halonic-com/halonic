// What an open engine reads of the workspace (`studio.engine-service`, HAL-16324): the files as
// they were saved when a start, an answer or a routine's start last asked, not as they
// were when the engine opened. Definitions, models, chat turns, the budget and the trust checks
// read that copy. Local only is built into the engine's executor and harness host, so a save that
// turns it on or off needs a new engine, as `halonic routines watch` does (HAL-6084): the copy is
// kept as it was, and the service opens a new engine, on that save once no run is going
// (`reopenOnLocalOnlySave`), or refuses.

import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { LocalExecutor } from "@halonicjs/engine";
import { KindedError } from "@halonicjs/std";
import { TryAgainLater } from "@halonicjs/studio-shell";
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

  /** Whether `saved` keeps local only as the engine was built, so the engine may read it. */
  keepsLocalOnly(saved: LoadedWorkspace): boolean {
    return isLocalOnly(saved) === this.localOnly;
  }

  /**
   * Takes `saved` as the files the engine reads from now on, unless it turns local only on or off.
   *
   * @returns whether it was taken; when not, the engine must not start anything more
   */
  take(saved: LoadedWorkspace): boolean {
    if (!this.keepsLocalOnly(saved)) return false;
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
 * @param saved the open engine's workspace, whose local only the save turned the other way
 * @throws TryAgainLater when a run is going, so the page offers to try again once it ends
 */
export async function refuseWhileRunsGo(
  executor: LocalExecutor,
  runs: TauriRunStore,
  name: string,
  saved: SavedWorkspace,
): Promise<void> {
  if (!(await hasRunGoing(executor, runs))) return;
  throw localOnlyChangedWhileGoing(name, saved);
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
 * The refusal of a start or an answer the open engine can't make because local only was turned on
 * or off while a run was going. It says which way, so the person knows what the saved files now
 * ask for (check C700, HAL-16373), and leaves "didn't start" to each screen's lead (C701 row 5).
 *
 * @param saved the open engine's workspace; the save turned its local only the other way
 */
export function localOnlyChangedWhileGoing(name: string, saved: SavedWorkspace): TryAgainLater {
  return new TryAgainLater(
    `Local only was turned ${turnedOf(saved)} in ${name} while a run was going.`,
    "Try again once that run ends.",
  );
}

/**
 * The refusal of a routine's start because local only was turned on or off, also with no run
 * going: the engine opens anew only after the tick (`takeForRoutine`), so the next time starts.
 *
 * @param saved the open engine's workspace; the save turned its local only the other way
 */
export function localOnlyChangedForRoutine(name: string, saved: SavedWorkspace): KindedError {
  return new KindedError("unavailable", `Local only was turned ${turnedOf(saved)} in ${name}.`, {
    fix: "It starts at its next time.",
  });
}

/** Which way a save turned local only: the other way from the open engine's. */
function turnedOf(saved: SavedWorkspace): "on" | "off" {
  return saved.localOnly ? "off" : "on";
}
