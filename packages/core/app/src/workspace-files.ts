import type { DefinitionStore } from "@halonicjs/ports";
import type { EventBus } from "./event-bus.ts";
import { UndoHistory } from "./undo-history.ts";
import type { AppEvents } from "./workspace-scope.ts";

/**
 * Unsaved changes by workspace-relative path: the new text, or `null` for a
 * file to delete. Never changed in place, so an undo step can keep one.
 */
export type PendingChanges = Readonly<Record<string, string | null>>;

/** One file a save wrote or deleted: its store text before and after, `null` for no file. */
interface SavedFile {
  path: string;
  before: string | null;
  after: string | null;
}

/**
 * Measures unsaved changes against the store after a save instead of before
 * it. A file the snapshot left alone had the old store text, so it now
 * differs by that text; a file whose unsaved text is what was saved no
 * longer differs.
 */
function rebase(snapshot: PendingChanges, saved: readonly SavedFile[]): PendingChanges {
  const rebased: Record<string, string | null> = { ...snapshot };
  for (const { path, before, after } of saved) {
    if (!Object.hasOwn(rebased, path)) {
      rebased[path] = before;
    }
    if (rebased[path] === after) {
      delete rebased[path];
    }
  }
  return rebased;
}

/** Options for {@link WorkspaceFiles.change}. */
export interface ChangeOptions {
  /**
   * Changes in a row with the same key make one undo step, such as typing in
   * one file (the old `Studio` used the file path). Absent: a step of its own.
   */
  coalesceKey?: string;
}

/**
 * The files of one open workspace with their unsaved changes, one
 * workspace-wide undo history (200 steps) and `save`, as in the old `Studio`
 * class. Feature models are worked out from the file text, so an
 * undo step only needs the map of unsaved changes. That map is measured
 * against the store, so a save rewrites the kept steps against the new
 * store content: undoing past a save marks the file unsaved with its older
 * text, as editors such as VS Code do.
 *
 * Every change sends `files.changed`; a save sends `files.saved`.
 */
export class WorkspaceFiles {
  private changes: PendingChanges = {};
  private readonly history = new UndoHistory<PendingChanges>();
  private saving: Promise<number> | null = null;
  /** Goes up on every discard, so a save that was running can tell. */
  private discards = 0;
  private readonly store: DefinitionStore;
  private readonly events: EventBus<AppEvents>;

  constructor(store: DefinitionStore, events: EventBus<AppEvents>) {
    this.store = store;
    this.events = events;
  }

  /** The unsaved changes. */
  get pending(): PendingChanges {
    return this.changes;
  }

  /** Whether anything is unsaved. */
  get dirty(): boolean {
    return Object.keys(this.changes).length > 0;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** A file's text with the unsaved changes applied, or `null` when there is no such file. */
  async read(path: string): Promise<string | null> {
    if (Object.hasOwn(this.changes, path)) {
      return this.changes[path] ?? null;
    }
    return this.store.read(path);
  }

  /**
   * Changes files without saving them, as one undo step.
   *
   * @param label - says what changed, such as "Renamed state s to ask"
   * @param changes - new text by path, or `null` to delete the file
   */
  change(label: string, changes: Record<string, string | null>, options: ChangeOptions = {}): void {
    this.history.record(this.changes, options.coalesceKey ?? null);
    this.apply({ ...this.changes, ...changes }, label);
  }

  /** Goes back one step. Returns `false` when there was nothing to undo. */
  undo(): boolean {
    const previous = this.history.undo(this.changes);
    if (previous === undefined) {
      return false;
    }
    this.apply(previous, "Undone");
    return true;
  }

  /** Goes forward one step. Returns `false` when there was nothing to redo. */
  redo(): boolean {
    const next = this.history.redo(this.changes);
    if (next === undefined) {
      return false;
    }
    this.apply(next, "Redone");
    return true;
  }

  /**
   * Writes every unsaved change to the store, in the order the files were
   * first changed, and deletes the files marked for deletion. The undo
   * history stays, as in the old `Studio`, rewritten so that undoing a saved
   * change gives back the text from before it.
   *
   * A file changed again while the save runs stays unsaved with its new
   * text. If a write fails, the save stops and every change stays unsaved,
   * so saving again is safe. A save asked for while another runs waits for
   * it, then saves what is left. With nothing unsaved it does nothing.
   *
   * A discard while the save runs wins: the store is then the truth, and
   * nothing the save wrote comes back as unsaved. The discard doesn't stop
   * the save, though: it still writes the files it has left.
   *
   * An undo or redo while the save runs can show a file wrongly until the
   * save ends: as unsaved when it matches the store, or as saved when the
   * save has already written newer text. The end of the save then sets the
   * right state.
   *
   * @returns how many files were written or deleted
   */
  async save(): Promise<number> {
    while (this.saving !== null) {
      // Its failure belongs to whoever started it; this save tries again with what is left.
      await this.saving.catch(() => undefined);
    }
    const run = this.saveOnce();
    this.saving = run;
    try {
      return await run;
    } finally {
      if (this.saving === run) {
        this.saving = null;
      }
    }
  }

  private async saveOnce(): Promise<number> {
    const saving = Object.entries(this.changes);
    if (saving.length === 0) {
      return 0;
    }
    const discards = this.discards;
    const written: SavedFile[] = [];
    try {
      for (const [path, text] of saving) {
        const before = await this.store.read(path);
        if (text === null) {
          await this.store.remove(path);
        } else {
          await this.store.write(path, text);
        }
        written.push({ path, before, after: text });
      }
    } finally {
      // Also after a failed write: the files written so far are in the store now.
      // After a discard the history and changes are already measured against the store.
      if (this.discards === discards) {
        this.history.map((snapshot) => rebase(snapshot, written));
      }
    }
    // What changed again while saving still differs from the store, so it stays unsaved.
    const left = this.discards === discards ? rebase(this.changes, written) : this.changes;
    this.history.breakStep();
    this.apply(left, `Saved ${saving.length} file${saving.length === 1 ? "" : "s"}`);
    this.events.emit("files.saved", { paths: saving.map(([path]) => path) });
    return saving.length;
  }

  /** Drops every unsaved change and the undo history, such as when the files are read again from disk. */
  discard(): void {
    this.discards++;
    this.history.clear();
    this.apply({}, "Unsaved changes discarded");
  }

  private apply(changes: PendingChanges, label: string): void {
    this.changes = changes;
    this.events.emit("files.changed", { pending: changes, label });
  }
}
