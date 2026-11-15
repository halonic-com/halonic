import { type ChangeLine, describeFileChange, type FileChange, revertParts } from "@halonicjs/app";
import type { VcsChange } from "@halonicjs/ports";
import type { PlaceSignal, ServiceKey } from "@halonicjs/studio-shell";
import { serviceKey } from "@halonicjs/studio-shell";
import type { ChangesRead, ChangesSource, FileTexts } from "./api.ts";
import { pageWords, undoWords } from "./changes-words.ts";
import { loadFailureReason } from "./load-failure.ts";

/** How many changed files' texts are read at the same time. */
const readsAtOnce = 4;

/** One changed file: what changed in it, and the texts the changes can be undone from. */
export interface ChangedFile {
  readonly path: string;
  readonly description: FileChange;
  /** `undefined` when the file couldn't be read as text; its lines then have no parts to undo. */
  readonly texts: FileTexts | undefined;
}

/** What {@link ChangesList.undoChange} did. */
export type UndoOutcome =
  /** The change is undone; `undo` puts it back, as the toast's Undo does, and says why when it can't. */
  | { readonly kind: "undone"; readonly undo: () => Promise<string | undefined> }
  | { readonly kind: "failed"; readonly reason: string };

/** What the Changes list holds now. */
export interface ChangesListState {
  /** The last read that worked; `undefined` before the first one. */
  readonly read: ChangesRead | undefined;
  /** What changed in each file of `read`, one entry for each path. Empty until a read worked. */
  readonly files: readonly ChangedFile[];
  /** Why the last read failed, until one works; `read` stays as it was. */
  readonly error: unknown;
  /** Why Turn on history failed, until the next try. */
  readonly turnOnError: unknown;
  /** Whether Turn on history is working. */
  readonly turningOn: boolean;
}

/**
 * The changes of one open workspace, kept current from its `ChangesSource`. The sidebar's count
 * and the Changes page read this one service, so they change together. A read only swaps the
 * answer: the page never shows a skeleton again once it has one (states D1).
 *
 * @example
 * const list = new ChangesList(source);
 * list.subscribe(() => render(list.state.read));
 */
export class ChangesList {
  readonly source: ChangesSource;
  #state: ChangesListState = {
    read: undefined,
    files: [],
    error: undefined,
    turnOnError: undefined,
    turningOn: false,
  };
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  #reads = 0;
  #disposed = false;

  constructor(source: ChangesSource) {
    this.source = source;
    this.#stopWatching = source.subscribe(() => void this.refresh());
    void this.refresh();
  }

  get state(): ChangesListState {
    return this.#state;
  }

  /** How many files changed since the last version; zero when nothing did or there is no history. */
  get changedFileCount(): number {
    const read = this.#state.read;
    return read?.kind === "ready" ? new Set(read.changes.map((change) => change.path)).size : 0;
  }

  /** The sidebar's count, "Changes, 3 changes"; nothing at zero. */
  signal(): PlaceSignal | undefined {
    const count = this.changedFileCount;
    if (count === 0) return undefined;
    return { mark: "count", value: count, spoken: pageWords.spokenCount(count) };
  }

  /**
   * Reads the changes again. When reads overlap, only the last one started counts, so an older
   * answer never overwrites a newer one. Once the workspace has closed it does nothing.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const read = ++this.#reads;
    try {
      const answer = await this.source.read();
      const files = answer.kind === "ready" ? await this.#describe(answer.changes) : [];
      if (read !== this.#reads || this.#disposed) return;
      this.#set({ ...this.#state, read: answer, files, error: undefined });
    } catch (error) {
      if (read !== this.#reads || this.#disposed) return;
      this.#set({ ...this.#state, error });
    }
  }

  /**
   * Undoes one line of what changed in a file: its parts go back to how the last version has them
   * and the rest of the file stays as it is. Nothing is written when the file changed since the
   * list read it.
   */
  async undoChange(file: ChangedFile, line: ChangeLine): Promise<UndoOutcome> {
    const { texts } = file;
    if (texts?.before == null || texts.after === null || line.parts.length === 0) {
      return { kind: "failed", reason: undoWords.cantUndo };
    }
    const reverted = revertParts(texts.after, texts.before, line.parts);
    if (!reverted.ok) return { kind: "failed", reason: undoWords.cantUndo };
    const { after } = texts;
    const outcome = await this.#replace(file.path, reverted.value, after);
    if (outcome === undefined) {
      return {
        kind: "undone",
        undo: () => this.#replace(file.path, after, reverted.value),
      };
    }
    return { kind: "failed", reason: outcome };
  }

  /** Writes a file's new text, then reads again; the reason it didn't work, or `undefined`. */
  async #replace(path: string, text: string, expected: string): Promise<string | undefined> {
    try {
      const result = await this.source.replaceFile(path, text, expected);
      await this.refresh();
      return result === "replaced" ? undefined : undoWords.changedMeanwhile;
    } catch (error) {
      return loadFailureReason(error);
    }
  }

  /** What changed in each file, one entry for each path. A file that can't be read is just "Changed". */
  async #describe(changes: readonly VcsChange[]): Promise<ChangedFile[]> {
    const firstOfEachPath = [...new Map(changes.map((change) => [change.path, change])).values()];
    const files: ChangedFile[] = [];
    // A few files at a time: every read starts a git process.
    for (let start = 0; start < firstOfEachPath.length; start += readsAtOnce) {
      const batch = firstOfEachPath.slice(start, start + readsAtOnce);
      files.push(...(await Promise.all(batch.map((change) => this.#describeFile(change)))));
    }
    return files;
  }

  async #describeFile(change: VcsChange): Promise<ChangedFile> {
    try {
      const texts = await this.source.readTexts(change);
      const description = describeFileChange(change.path, texts.before, texts.after);
      return { path: change.path, description, texts };
    } catch {
      return { path: change.path, description: unreadable(change), texts: undefined };
    }
  }

  /** Turns history on, then reads again. A failure stays in `turnOnError` for the page to say. */
  async turnOnHistory(): Promise<void> {
    if (this.#disposed || this.#state.turningOn) return;
    this.#set({ ...this.#state, turningOn: true, turnOnError: undefined });
    try {
      await this.source.turnOnHistory();
    } catch (error) {
      if (!this.#disposed) this.#set({ ...this.#state, turningOn: false, turnOnError: error });
      return;
    }
    if (this.#disposed) return;
    this.#set({ ...this.#state, turningOn: false });
    await this.refresh();
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops watching, when the workspace closes and its services are disposed. */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    this.#listeners.clear();
  }

  #set(state: ChangesListState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The one line for a file that couldn't be read as text: only that it is new, deleted or changed. */
function unreadable(change: VcsChange): FileChange {
  let sentence = "Changed";
  if (change.status === "added" || change.status === "untracked") sentence = "New";
  if (change.status === "deleted") sentence = "Deleted";
  return {
    path: change.path,
    kind: undefined,
    lines: [{ id: "item", sentence, parts: [] }],
    described: false,
  };
}

/** The open workspace's {@link ChangesList}; the feature provides it from `ChangesSourceService`. */
export const ChangesListService: ServiceKey<ChangesList> =
  serviceKey<ChangesList>("source-control.list");
