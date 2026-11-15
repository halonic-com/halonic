import { SaveScheduler } from "@halonicjs/app";
import {
  type KeyboardPlatform,
  type SaveReason,
  type SaveState,
  saveFailureFor,
} from "@halonicjs/studio-shell";

/** How long after the last change a workspace saves by itself (save model 1). */
export const AUTOSAVE_DELAY_MS = 1000;

/** What {@link WorkspaceSaving} needs of a workspace's files: the kernel's `WorkspaceFiles`. */
export interface SavableFiles {
  /** Whether anything is unsaved. */
  readonly dirty: boolean;
  /** Writes every unsaved change; rejects when a write fails, and the changes stay unsaved. */
  save(): Promise<unknown>;
  undo(): unknown;
  redo(): unknown;
}

/** What {@link WorkspaceSaving} needs. */
export interface WorkspaceSavingOptions {
  readonly files: SavableFiles;
  /** Calls `listener` after every change of the unsaved changes; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The window workspace's save state, which holds the toolbar's note and the failed-save toast. */
  readonly saving: SaveState;
  /** The workspace's name, which a failed save names, such as "Acme". */
  readonly name: string;
  /** How long to wait after the last change; {@link AUTOSAVE_DELAY_MS} unless a test says. */
  readonly delayMs?: number;
}

/** Why the last save failed, for the close dialog. */
export interface SaveProblem {
  readonly reason: SaveReason;
}

/**
 * Saves one workspace's files by itself: a short pause after each change, so typing is one save,
 * through the window's {@link SaveState}, which shows "Saving…", a failed save's toast and
 * **Try again**. It also maps Ctrl Z and Ctrl Shift Z to the workspace's undo and redo, and tells
 * the switcher whether the workspace can close without losing a change (save model 1.6).
 *
 * @example
 * const saving = new WorkspaceSaving({ files, onChange, saving: workspace.saving, name: "Acme" });
 * // …the workspace closes:
 * if (await saving.saveNow()) closeIt();
 */
export class WorkspaceSaving {
  readonly #options: WorkspaceSavingOptions;
  readonly #stop: () => void;
  readonly #scheduler: SaveScheduler;
  #problem: SaveProblem | undefined;

  constructor(options: WorkspaceSavingOptions) {
    this.#options = options;
    this.#scheduler = new SaveScheduler({
      save: () => this.#write(),
      isDirty: () => options.files.dirty,
      timers: {
        set: (callback, delayMs) => setTimeout(callback, delayMs),
        clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      // A failed save has already shown its toast and kept its reason in `problem`.
      onError: () => undefined,
      delayMs: options.delayMs ?? AUTOSAVE_DELAY_MS,
    });
    this.#stop = options.onChange(() => this.#scheduler.changed());
  }

  /** Why the last save failed, until a save works; `undefined` when it didn't. */
  get problem(): SaveProblem | undefined {
    return this.#problem;
  }

  /** Saves what's waiting now, without the pause. Resolves to whether nothing is left unsaved. */
  async saveNow(): Promise<boolean> {
    return this.#scheduler.flush("save-now");
  }

  /** Ctrl Z: goes back one step. */
  undo(): void {
    this.#options.files.undo();
  }

  /** Ctrl Shift Z: goes forward one step. */
  redo(): void {
    this.#options.files.redo();
  }

  /** Stops following the files and drops a save that was waiting. Call it once, when the workspace closes. */
  dispose(): void {
    this.#scheduler.dispose();
    this.#stop();
  }

  /** One save through the window's {@link SaveState}, which shows its note and a failure's toast. */
  async #write(): Promise<void> {
    const { files, saving, name } = this.#options;
    await saving.save({ key: "workspace", title: name }, async () => {
      try {
        await files.save();
        this.#problem = undefined;
      } catch (error) {
        this.#problem = { reason: saveFailureFor(error).reason };
        throw error;
      }
    });
  }
}

/** What Ctrl Z and Ctrl Shift Z ask for, or `undefined` for any other press. */
export function historyKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  platform: KeyboardPlatform,
): "undo" | "redo" | undefined {
  const mod =
    platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey || event.key.toLowerCase() !== "z") {
    return undefined;
  }
  return event.shiftKey ? "redo" : "undo";
}
