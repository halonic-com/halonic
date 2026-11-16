import type { DefinitionStore, ExpectedContent, RemoveResult } from "@halonicjs/ports";
import { contentDigest, type Sha256 } from "@halonicjs/std";
import type { EventBus } from "./event-bus.ts";
import type { Trash } from "./review-types.ts";
import { UndoHistory } from "./undo-history.ts";
import {
  CannotCombineError,
  type CompareChoice,
  type CompareView,
  compareTexts,
} from "./workspace-compare.ts";
import { planRename } from "./workspace-rename.ts";
import { ChangedOnDiskError, type HeldFile, rebase, type SavedFile } from "./workspace-saved.ts";
import type { AppEvents } from "./workspace-scope.ts";

export { ChangedOnDiskError, type HeldFile } from "./workspace-saved.ts";

/**
 * Unsaved changes by workspace-relative path: the new text, or `null` for a
 * file to delete. Never changed in place, so an undo step can keep one.
 */
export type PendingChanges = Readonly<Record<string, string | null>>;

/**
 * Puts a delete before the write of a path that differs from it only in case.
 * On a disk that ignores case both are one file, so writing first and
 * deleting after would delete the new text.
 */
function deletesFirstOnSameName(entries: [string, string | null][]): [string, string | null][] {
  const written = new Set(
    entries.filter(([, text]) => text !== null).map(([p]) => p.toLowerCase()),
  );
  const first = (path: string, text: string | null) =>
    text === null && written.has(path.toLowerCase());
  return [
    ...entries.filter(([path, text]) => first(path, text)),
    ...entries.filter(([path, text]) => !first(path, text)),
  ];
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
  /** Goes up on every change to the undo steps; see `step`. */
  private steps = 0;
  private readonly store: DefinitionStore;
  private readonly events: EventBus<AppEvents>;
  private readonly digest: Sha256;
  private readonly trash: Trash | undefined;
  /** The store text Halonic last read or wrote by path, `null` for no file: what a save expects to find. */
  private readonly known = new Map<string, string | null>();
  /**
   * Each rename since the last discard by old path: the new path and the text
   * the rename gave it. A save of the old path's delete keeps it out of the
   * trash only when it writes exactly that text there.
   */
  private readonly moves = new Map<string, { to: string; text: string }>();

  /**
   * @param digest - hashes text for the write-if-unchanged check; core has no hash of its own
   * @param trash - where a saved delete goes, so the file's text is kept; it must work over the same store
   */
  constructor(store: DefinitionStore, events: EventBus<AppEvents>, digest: Sha256, trash?: Trash) {
    this.trash = trash;
    this.store = store;
    this.events = events;
    this.digest = digest;
  }

  /** The unsaved changes. */
  get pending(): PendingChanges {
    return this.changes;
  }

  /**
   * A marker of the newest undo step: it moves on `change`, `rename`, `undo`, `redo`, a reload from
   * outside that took files in, a Compare choice that changed a file (`use-other`, `combine-both`)
   * and `discard`, and stays put on a save. `pending` is a new object after a save too, so only this
   * tells that nothing was done since a step, such as a delete behind an Undo toast, even when
   * autosave has run.
   *
   * @example
   * files.change("Deleted a", { "a.yaml": null });
   * const step = files.step;
   * await files.save();
   * files.step === step; // true: `files.undo()` still brings a.yaml back
   */
  get step(): number {
    return this.steps;
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
    const text = await this.store.read(path);
    // No unsaved edit here, so this read is what the next edits are made against.
    this.known.set(path, text);
    return text;
  }

  /**
   * The file paths under a folder, saved files and unsaved changes together (requirement
   * `app.workspace-list`): an unsaved new file is listed, an unsaved delete is left out.
   *
   * @param dir - the folder, such as "providers"
   */
  async list(dir: string): Promise<string[]> {
    const paths = new Set(await this.store.list(dir));
    for (const [path, text] of Object.entries(this.changes)) {
      if (!path.startsWith(`${dir}/`)) continue;
      if (text === null) paths.delete(path);
      else paths.add(path);
    }
    return [...paths].sort();
  }

  /**
   * Changes files without saving them, as one undo step.
   *
   * @param label - says what changed, such as "Renamed state s to ask"
   * @param changes - new text by path, or `null` to delete the file
   */
  change(label: string, changes: Record<string, string | null>, options: ChangeOptions = {}): void {
    this.steps++;
    this.history.record(this.changes, options.coalesceKey ?? null);
    this.apply({ ...this.changes, ...changes }, label);
  }

  /**
   * Renames a file as one undo step: its text moves to the new path, the old
   * path is deleted when saved and `rewrites` change the files that name it.
   * The old file does not go to the trash, because its text lives on at the
   * new path; Git sees the rename from the identical text.
   *
   * @param rewrites - new text by path for other files that name the old path; one for `from` is the text the new file gets
   * A rename that only changes the case of the name, such as `a.yaml` to `A.yaml`, is allowed on a disk that
   * ignores case, where both names are the same file. A save then deletes the old name before it writes the new.
   *
   * @throws RenameRefusedError when `from` is missing or deleted, or `to` already exists, on disk or as an unsaved new file
   */
  async rename(from: string, to: string, rewrites: Record<string, string> = {}): Promise<void> {
    // Store reads first: `change` may run while they wait, so the unsaved changes are read after them.
    const fromStored = await this.store.read(from);
    const toSaved = (await this.store.read(to)) !== null;
    const toIsFrom = toSaved && (await this.isSameFile(from, to));
    const changes = this.changes;
    const fromText = Object.hasOwn(changes, from) ? changes[from] : fromStored;
    if (!Object.hasOwn(changes, from)) {
      this.known.set(from, fromStored);
    }
    const next = planRename({
      from,
      to,
      changes,
      fromText: fromText ?? null,
      fromSaved: fromStored !== null,
      toSaved: toSaved && !toIsFrom,
      rewrites,
    });
    const text = next[to] as string;
    this.steps++;
    this.history.record(changes, null);
    // A rename of a file that was itself just moved carries the first move on to the new path.
    for (const [origin, move] of this.moves) {
      if (move.to === from) this.moves.set(origin, { to, text });
    }
    this.moves.set(from, { to, text });
    this.apply(next, `Renamed ${from} to ${to}`);
  }

  /** Goes back one step. Returns `false` when there was nothing to undo. */
  undo(): boolean {
    const previous = this.history.undo(this.changes);
    if (previous === undefined) {
      return false;
    }
    this.steps++;
    this.apply(previous, "Undone");
    return true;
  }

  /** Goes forward one step. Returns `false` when there was nothing to redo. */
  redo(): boolean {
    const next = this.history.redo(this.changes);
    if (next === undefined) {
      return false;
    }
    this.steps++;
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
   * Every write passes what Halonic last read of the file as `expected`, so
   * a file that changed outside Halonic is never overwritten. Saving pauses
   * for that file only: the others are written, and the save then ends with a
   * {@link ChangedOnDiskError} that lists the files it held. Their changes
   * stay unsaved.
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
    const saving = deletesFirstOnSameName(Object.entries(this.changes));
    if (saving.length === 0) {
      return 0;
    }
    const discards = this.discards;
    const written: SavedFile[] = [];
    const held: HeldFile[] = [];
    try {
      for (const [path, text] of saving) {
        const before = await this.store.read(path);
        const expected = await this.expectedFor(path, before);
        const result =
          text === null
            ? await this.delete(path, before, expected, this.isMoved(path, saving))
            : await this.store.write(path, text, { expected });
        if (result.status === "changed-on-disk") {
          // `known` stays: another save must not overwrite the outside text. Only a fresh read moves it.
          held.push({ path, current: result.current });
          continue;
        }
        this.known.set(path, text);
        written.push({ path, before, after: text });
      }
    } finally {
      // Also after a failed write: the files written so far are in the store now.
      this.forgetSavedMoves(written);
      // After a discard the history and changes are already measured against the store.
      if (this.discards === discards) {
        this.history.map((snapshot) => rebase(snapshot, written));
      }
    }
    if (written.length > 0) {
      // What changed again while saving still differs from the store, so it stays unsaved.
      const left = this.discards === discards ? rebase(this.changes, written) : this.changes;
      this.history.breakStep();
      this.apply(left, `Saved ${written.length} file${written.length === 1 ? "" : "s"}`);
      this.events.emit("files.saved", { paths: written.map(({ path }) => path) });
    }
    const [first] = held;
    if (first !== undefined) {
      throw new ChangedOnDiskError(first.path, first.current, held);
    }
    return written.length;
  }

  /**
   * Both texts of a file that changed outside Halonic, for Compare (save model
   * 6.3). Reads the file again, so it shows the text in the store now.
   */
  async compare(path: string): Promise<CompareView> {
    const theirs = await this.store.read(path);
    const base = this.known.has(path) ? (this.known.get(path) ?? null) : theirs;
    const mine = Object.hasOwn(this.changes, path) ? (this.changes[path] ?? null) : theirs;
    return compareTexts(path, base, mine, theirs);
  }

  /**
   * Settles a file that changed outside Halonic with the choice made in
   * Compare. Afterwards the file counts as read in its new text, so saving
   * works again.
   *
   * - `keep-mine`: the unsaved changes stay and the next save overwrites the
   *   outside text. That is no change to the text, so it is no undo step.
   * - `use-other`: the unsaved changes to the file are dropped.
   * - `combine-both`: the file gets the two texts put together. Throws
   *   {@link CannotCombineError} when `compare` gave no `combined`.
   *
   * The last two are one undo step. Undoing one brings the person's text
   * back, and Halonic then expects the outside text: the next save overwrites
   * it, as the person's undo asked.
   *
   * @returns the Compare view the choice was made on
   */
  async settle(path: string, choice: CompareChoice): Promise<CompareView> {
    const view = await this.compare(path);
    if (choice === "combine-both" && view.combined === null) {
      throw new CannotCombineError(path);
    }
    this.known.set(path, view.theirs);
    if (choice === "keep-mine") return view;
    const text = choice === "use-other" ? view.theirs : view.combined;
    const { [path]: _settled, ...others } = this.changes;
    this.steps++;
    this.history.record(this.changes);
    // A file that now reads what the store holds has nothing left to save.
    const settled = text === view.theirs ? others : { ...others, [path]: text };
    this.apply(settled, choice === "use-other" ? `Used the other ${path}` : `Combined ${path}`);
    return view;
  }

  /**
   * Takes in what changed outside Halonic for files with no unsaved changes,
   * as one undo step labelled "Changed outside Halonic". The files then read
   * their new text and a save expects it. Undoing the step brings the older
   * text back as an unsaved change, as undoing past a save does.
   *
   * A file with unsaved changes is left alone and listed as `held`: its
   * changes would be lost, so Compare settles it. A file that was never read
   * has nothing to take in and is left out of both lists.
   *
   * A save that is running is waited for first, and a file Halonic read or
   * wrote again while the store read waited keeps that newer text.
   *
   * @param paths - the files that changed, such as the paths a watch reported
   * @returns the files taken in, with `null` for the text of one that is gone, and the files held
   */
  async reloadFromOutside(
    paths: readonly string[],
  ): Promise<{ reloaded: HeldFile[]; held: string[] }> {
    while (this.saving !== null) {
      // A save in progress is still writing these files; what the watch reports may be its own writes.
      await this.saving.catch(() => undefined);
    }
    // Store reads first: `change` may run while they wait, so the unsaved changes are read after them.
    const stored = await Promise.all(
      paths.map(async (path) => {
        const seen = { has: this.known.has(path), text: this.known.get(path) };
        return { path, seen, text: await this.store.read(path) };
      }),
    );
    const changes = this.changes;
    const reloaded: HeldFile[] = [];
    const held: string[] = [];
    const saved: SavedFile[] = [];
    for (const { path, seen, text } of stored) {
      // Halonic read, wrote or settled the file while this read waited: that text is newer.
      if (this.known.has(path) !== seen.has || this.known.get(path) !== seen.text) continue;
      if (!this.known.has(path)) continue;
      if (Object.hasOwn(changes, path)) {
        held.push(path);
        continue;
      }
      const before = this.known.get(path) ?? null;
      this.known.set(path, text);
      if (before === text) continue;
      reloaded.push({ path, current: text });
      saved.push({ path, before, after: text });
    }
    if (saved.length === 0) return { reloaded, held };
    // The kept steps and the new one are measured against the new store text.
    this.history.map((snapshot) => rebase(snapshot, saved));
    this.steps++;
    this.history.record(rebase(changes, saved), null);
    this.apply(changes, "Changed outside Halonic");
    return { reloaded, held };
  }

  /** Drops every unsaved change and the undo history, such as when the files are read again from disk. */
  discard(): void {
    this.discards++;
    this.steps++;
    this.history.clear();
    this.known.clear();
    this.moves.clear();
    this.apply({}, "Unsaved changes discarded");
  }

  /**
   * Whether two paths that differ only in case are one file in the store: it
   * holds the file under both names, but lists it under one only.
   */
  private async isSameFile(from: string, to: string): Promise<boolean> {
    if (from === to || from.toLowerCase() !== to.toLowerCase()) return false;
    const slash = from.lastIndexOf("/");
    const listed = await this.store.list(slash < 0 ? undefined : from.slice(0, slash));
    return listed.includes(from) && !listed.includes(to);
  }

  /** Drops the renames whose delete or new file a save wrote, so they can't keep a later plain delete out of the trash. */
  private forgetSavedMoves(written: readonly SavedFile[]): void {
    for (const { path } of written) {
      for (const [origin, move] of this.moves) {
        if (origin === path || move.to === path) this.moves.delete(origin);
      }
    }
  }

  /** Whether the delete of this path is half of a rename whose new file is saved in the same go with the text the rename gave it. */
  private isMoved(path: string, saving: readonly [string, string | null][]): boolean {
    const move = this.moves.get(path);
    return (
      move !== undefined && saving.some(([each, text]) => each === move.to && text === move.text)
    );
  }

  /** Deletes a file: into the trash when there is one and the file wasn't renamed, else out of the store. */
  private async delete(
    path: string,
    before: string | null,
    expected: ExpectedContent,
    renamed: boolean,
  ): Promise<RemoveResult> {
    if (this.trash === undefined || before === null || renamed) {
      return this.store.remove(path, { expected });
    }
    const moved = await this.trash.moveToTrash(path, expected);
    return moved.status === "done" ? { status: "removed" } : moved;
  }

  /** What the file should still hold: the text last read, or the text just read for a file never read. */
  private async expectedFor(path: string, current: string | null): Promise<ExpectedContent> {
    const text = this.known.has(path) ? (this.known.get(path) ?? null) : current;
    return text === null ? "absent" : await contentDigest(text, this.digest);
  }

  private apply(changes: PendingChanges, label: string): void {
    this.changes = changes;
    this.events.emit("files.changed", { pending: changes, label });
  }
}
