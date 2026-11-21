// Opens the page's engine as soon as a workspace needs it (HAL-14205), not
// only at the first run or send: when the workspace may start runs and has a
// routine that starts on a clock or a run timer waiting, so the routines start
// on time and the timers fire while the window is open. Asked when the
// workspace opens, when its trust changes and after a save.

import { runTimerCollection } from "@halonicjs/adapter-workspace-models";
import { type DefinitionSource, foldRecords, type RecordStore } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";

/** The open workspace's {@link EngineAutoOpen}, so the workspace's registry disposes it first. */
export const engineAutoOpenKey: ServiceKey<EngineAutoOpen> =
  serviceKey<EngineAutoOpen>("studio.engine-auto-open");

/** What {@link EngineAutoOpen} reads and opens. */
export interface EngineAutoOpenParts {
  /** The engine service's `open`, which takes the lock and starts the routines. */
  open(): Promise<unknown>;
  /** The saved files, which the routines are read from. */
  readonly definitions: DefinitionSource;
  /** The shell's records, where the engine keeps its run timers. */
  readonly records: Pick<RecordStore, "changes">;
  /** Whether anything may start from the workspace as loaded; a check that rejects is a no. */
  mayStart(workspace: LoadedWorkspace): Promise<boolean>;
  /** Calls `listener` when the answer may have changed: the trust, or the saved files. */
  onChange(listener: () => void): () => void;
  /** Hears why the engine didn't open, such as another engine holding the lock. */
  reportError(error: unknown): void;
}

/** Opens the engine of one workspace once it needs it, until disposed with the workspace. */
export class EngineAutoOpen {
  readonly #parts: EngineAutoOpenParts;
  readonly #stopListening: () => void;
  #stopped = false;
  #checking: Promise<void> | undefined;
  #again = false;

  constructor(parts: EngineAutoOpenParts) {
    this.#parts = parts;
    this.#stopListening = parts.onChange(() => this.check());
  }

  /**
   * Opens the engine when the workspace needs it. A call while one is still checking asks once
   * more after it, so a save in between isn't missed.
   */
  check(): Promise<void> {
    if (this.#checking !== undefined) {
      this.#again = true;
      return this.#checking;
    }
    this.#checking = this.#checkOnce()
      .catch((error: unknown) => this.#parts.reportError(error))
      .finally(() => {
        this.#checking = undefined;
        if (this.#again) {
          this.#again = false;
          void this.check();
        }
      });
    return this.#checking;
  }

  /** Stops asking; the engine itself closes with the workspace. */
  dispose(): void {
    this.#stopped = true;
    this.#stopListening();
  }

  async #checkOnce(): Promise<void> {
    if (this.#stopped) return;
    const workspace = await loadWorkspace(this.#parts.definitions);
    const needed = hasClockRoutine(workspace) || (await this.#hasRunTimers());
    if (!needed || this.#stopped) return;
    if (!(await this.#parts.mayStart(workspace).catch(() => false)) || this.#stopped) return;
    await this.#parts.open();
  }

  async #hasRunTimers(): Promise<boolean> {
    return foldRecords(await this.#parts.records.changes(runTimerCollection)).size > 0;
  }
}

/** Whether an enabled routine of the workspace starts on a schedule or an interval. */
function hasClockRoutine(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "routine").some(
    ({ value }) => value.enabled && ("schedule" in value.trigger || "every" in value.trigger),
  );
}
