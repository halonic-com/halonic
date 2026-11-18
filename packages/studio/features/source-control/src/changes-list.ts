import { type ChangeLine, revertParts } from "@halonicjs/app";
import type { VcsChange } from "@halonicjs/ports";
import { applyLineChanges, diffLines, type LineChange } from "@halonicjs/std";
import type { PlaceSignal, ServiceKey } from "@halonicjs/studio-shell";
import { serviceKey } from "@halonicjs/studio-shell";
import type { ChangesSource, Identity, KeptFile } from "./api.ts";
import { type ChangeItem, groupIntoItems } from "./change-items.ts";
import {
  type ChangedFile,
  type ChangesListState,
  type DiscardOutcome,
  historyPageSize,
  type UndoOutcome,
  type UpdatesOutcome,
} from "./changes-list-state.ts";
import { MergeSteps } from "./changes-merge.ts";
import { readRemote, ShareSteps } from "./changes-share.ts";
import {
  discardWords,
  pageWords,
  shareWords,
  undoWords,
  updatesWords,
  versionWords,
} from "./changes-words.ts";
import { describeChanges } from "./describe-changes.ts";
import { discardWithCopy } from "./discard-with-copy.ts";
import { isIdentityComplete } from "./identity.ts";
import { type IdentityOutcome, saveIdentity } from "./identity-save.ts";
import { loadFailureReason } from "./load-failure.ts";
import { versionMessage } from "./version-name.ts";

export type {
  ChangedFile,
  ChangesListState,
  DiscardOutcome,
  HistoryState,
  MergeOutcome,
  UndoOutcome,
  UpdatesOutcome,
} from "./changes-list-state.ts";
export { historyPageSize } from "./changes-list-state.ts";

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
    identity: undefined,
    hasRemote: false,
    unshared: 0,
    unsharedIds: new Set(),
    sharedCheck: { kind: "unknown" },
    sharing: false,
    gettingUpdates: false,
    merge: undefined,
    choosing: false,
    mergeBusy: false,
    version: undefined,
    history: { versions: [], more: false, loaded: false, error: undefined },
  };
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  #reads = 0;
  #historyReads = 0;
  #disposed = false;
  /** The steps of a merge of both sides: choose per item, Undo, Finish and Cancel. */
  readonly merge: MergeSteps;
  readonly #sharing: ShareSteps;

  constructor(source: ChangesSource) {
    this.source = source;
    const host = {
      source,
      state: () => this.#state,
      disposed: () => this.#disposed,
      set: (state: ChangesListState) => this.#set(state),
      refresh: () => this.refresh(),
    };
    this.merge = new MergeSteps(host);
    this.#sharing = new ShareSteps(host);
    this.#stopWatching = source.subscribe(() => void this.refresh());
    void this.refresh();
  }

  get state(): ChangesListState {
    return this.#state;
  }

  /** The rows of the list: an item's files together, other files one each (checklist 2.2). */
  get items(): readonly ChangeItem[] {
    return groupIntoItems(this.#state.files);
  }

  /** How many items changed since the last version; zero when nothing did or there is no history. */
  get changedItemCount(): number {
    return this.items.length;
  }

  /** The sidebar's count, "Changes, 3 changes"; nothing at zero. */
  signal(): PlaceSignal | undefined {
    const count = this.changedItemCount;
    if (count === 0) return undefined;
    return { mark: "count", value: count, spoken: pageWords.spokenCount(count) };
  }

  /** The merge left open: none, or the folder has no history, is `null`. */
  #readMerge = async (ready: boolean) => (ready ? await this.source.readMerge() : null);

  /**
   * Reads the changes again. When reads overlap, only the last one started counts, so an older
   * answer never overwrites a newer one. Once the workspace has closed it does nothing.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const read = ++this.#reads;
    try {
      const answer = await this.source.read();
      const files =
        answer.kind === "ready" ? await describeChanges(this.source, answer.changes) : [];
      const remote = await readRemote(this.source, answer.kind === "ready");
      if (read !== this.#reads || this.#disposed) return;
      const identity = answer.kind === "ready" ? await this.#identity() : undefined;
      const merge = await this.#readMerge(answer.kind === "ready");
      if (read !== this.#reads || this.#disposed) return;
      this.#set({
        ...this.#state,
        read: answer,
        files,
        ...remote,
        identity,
        merge: merge ?? undefined,
        choosing: merge !== null && this.#state.choosing,
        error: undefined,
      });
      if (answer.kind === "ready") await this.#readHistory(this.#state.history.versions.length);
      this.#sharing.checkOnce(remote.hasRemote && merge === null);
    } catch (error) {
      if (read !== this.#reads || this.#disposed) return;
      this.#set({ ...this.#state, error });
    }
  }

  /** Shows the next {@link historyPageSize} older versions. */
  async showMoreHistory(): Promise<void> {
    const { history } = this.#state;
    await this.#readHistory(Math.max(history.versions.length, historyPageSize) + historyPageSize);
  }

  /** Reads History again for Try again, after a read failed. */
  async refreshHistory(): Promise<void> {
    await this.#readHistory(this.#state.history.versions.length);
  }

  /**
   * Reads the newest `shown` versions, at least one page. One more than that is asked for to
   * know whether there are older ones. Only the last read started counts.
   */
  async #readHistory(shown: number): Promise<void> {
    const read = ++this.#historyReads;
    const limit = Math.max(shown, historyPageSize);
    try {
      const found = await this.source.readHistory(limit + 1);
      if (read !== this.#historyReads || this.#disposed) return;
      this.#set({
        ...this.#state,
        history: {
          versions: found.slice(0, limit),
          more: found.length > limit,
          loaded: true,
          error: undefined,
        },
      });
    } catch (error) {
      if (read !== this.#historyReads || this.#disposed) return;
      this.#set({ ...this.#state, history: { ...this.#state.history, error } });
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

  /**
   * The parts of a file's change as lines, for the developer view's "Discard this part". Empty
   * for a file that is new, deleted or can't be read as text: only the whole file goes back.
   */
  hunks(file: ChangedFile): readonly LineChange[] {
    const { texts } = file;
    if (texts?.before == null || texts.after === null) return [];
    return diffLines(texts.before, texts.after);
  }

  /**
   * Puts a whole file back as the last version has it: a changed or deleted file gets its text
   * back, a new file is deleted. A copy of what is thrown away is kept first, and the outcome's
   * `undo` brings it all back. When the copy can't be kept nothing is discarded and the outcome is
   * `noCopy`, unless `withoutCopy` says to go on without it.
   */
  async discardFile(
    file: ChangedFile,
    options: { readonly withoutCopy?: boolean } = {},
  ): Promise<DiscardOutcome> {
    const status = this.#discardStatus(file);
    if (typeof status !== "string") return { kind: "failed", reason: status.reason };
    const { texts } = file;
    if (texts === undefined) return { kind: "failed", reason: discardWords.cantDiscard };
    const { path } = file;
    const { before, after } = texts;
    if (status === "untracked" && after !== null) {
      return discardWithCopy(
        this.source,
        [{ path, text: after }],
        () => this.#remove(path, after),
        () => this.#replace(path, after, null),
        options,
      );
    }
    if (status === "modified" && before !== null && after !== null) {
      return discardWithCopy(
        this.source,
        [{ path, text: after }],
        () => this.#replace(path, before, after),
        () => this.#replace(path, after, before),
        options,
      );
    }
    if (status === "deleted" && before !== null && after === null) {
      return discardWithCopy(
        this.source,
        [],
        () => this.#replace(path, before, null),
        () => this.#remove(path, before),
        options,
      );
    }
    return { kind: "failed", reason: discardWords.cantDiscard };
  }

  /** Puts back one part of a file's change, from {@link hunks}, and keeps the rest of the file. */
  async discardPart(file: ChangedFile, part: LineChange): Promise<DiscardOutcome> {
    const status = this.#discardStatus(file);
    if (typeof status !== "string") return { kind: "failed", reason: status.reason };
    const { texts } = file;
    if (status !== "modified" || texts?.before == null || texts.after === null) {
      return { kind: "failed", reason: discardWords.cantDiscard };
    }
    const { before, after } = texts;
    const kept = diffLines(before, after).filter(
      (change) => change.beforeStart !== part.beforeStart || change.afterStart !== part.afterStart,
    );
    let text: string;
    try {
      text = applyLineChanges(before, kept);
    } catch {
      return { kind: "failed", reason: discardWords.cantDiscard };
    }
    const { path } = file;
    return discardWithCopy(
      this.source,
      [{ path, text: after }],
      () => this.#replace(path, text, after),
      () => this.#replace(path, after, text),
    );
  }

  /**
   * Opens Create version for `paths`, or for every changed file without them. Other screens use
   * it to open the dialog with one item in it.
   */
  startVersion(paths?: readonly string[]): void {
    this.#set({ ...this.#state, version: { paths } });
  }

  /** Who versions are from; once both parts are set they are kept, so a refresh doesn't ask git. */
  async #identity(): Promise<Identity> {
    const known = this.#state.identity;
    return known !== undefined && isIdentityComplete(known)
      ? known
      : await this.source.readIdentity();
  }

  /** Whether Create version must first ask who versions are from. */
  get needsIdentity(): boolean {
    const { identity, version } = this.#state;
    return version !== undefined && identity !== undefined && !isIdentityComplete(identity);
  }

  /** Saves who versions are from, so Create version can go on. */
  async saveIdentity(identity: Identity): Promise<IdentityOutcome> {
    const outcome = await saveIdentity(this.source, identity);
    if (outcome.kind === "saved" && !this.#disposed) {
      this.#set({ ...this.#state, identity: outcome.identity });
    }
    return outcome;
  }

  /** Closes Create version without creating anything. */
  cancelVersion(): void {
    if (this.#state.version !== undefined) this.#set({ ...this.#state, version: undefined });
  }

  /** The changed files Create version is open for; none while it is closed. */
  get versionFiles(): readonly ChangedFile[] {
    const { version, files } = this.#state;
    if (version?.paths === undefined) return version === undefined ? [] : files;
    const wanted = new Set(version.paths);
    return files.filter((file) => wanted.has(file.path));
  }

  /**
   * Records the open Create version as one version, then closes it and reads again. Only its
   * files go in, or only those of them in `only` when it is given; anything else stays a change.
   * Gives the reason it didn't work, or `undefined`.
   */
  async createVersion(
    name: string,
    notes: string,
    only?: readonly string[],
  ): Promise<string | undefined> {
    const { read } = this.#state;
    const left = only === undefined ? undefined : new Set(only);
    const files = this.versionFiles.filter((file) => left === undefined || left.has(file.path));
    if (read?.kind !== "ready" || files.length === 0) return versionWords.nothingToCreate;
    const chosen = new Set(files.map((file) => file.path));
    // A renamed file is two paths to git: the old one goes away, the new one comes in.
    const paths = [
      ...new Set(
        read.changes.flatMap((change) =>
          chosen.has(change.path)
            ? [change.path, ...(change.from === undefined ? [] : [change.from])]
            : [],
        ),
      ),
    ];
    try {
      await this.source.createVersion({ message: versionMessage(name, notes), paths });
    } catch (error) {
      return loadFailureReason(error);
    }
    if (!this.#disposed) this.#set({ ...this.#state, version: undefined });
    await this.refresh();
    return undefined;
  }

  /** Writes a file's new text, then reads again; the reason it didn't work, or `undefined`. */
  async #replace(path: string, text: string, expected: string | null): Promise<string | undefined> {
    try {
      const result = await this.source.replaceFile(path, text, expected);
      await this.refresh();
      return result === "replaced" ? undefined : undoWords.changedMeanwhile;
    } catch (error) {
      return loadFailureReason(error);
    }
  }

  /** Deletes a file, then reads again; the reason it didn't work, or `undefined`. */
  async #remove(path: string, expected: string): Promise<string | undefined> {
    try {
      const result = await this.source.removeFile(path, expected);
      await this.refresh();
      return result === "replaced" ? undefined : undoWords.changedMeanwhile;
    } catch (error) {
      return loadFailureReason(error);
    }
  }

  /**
   * How git has the file's change: its status, or why it can't be discarded here. Git's index is
   * not Halonic's: a file added to a version by another program is left to that program.
   */
  #discardStatus(file: ChangedFile): VcsChange["status"] | { readonly reason: string } {
    const { read } = this.#state;
    const entries = read?.kind === "ready" ? read.changes.filter((c) => c.path === file.path) : [];
    const [first] = entries;
    if (first === undefined || file.texts === undefined) {
      return { reason: discardWords.cantDiscard };
    }
    if (entries.some((entry) => entry.staged)) return { reason: discardWords.addedOutside };
    return first.status;
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

  /**
   * Gets the shared copy's newer versions and reads again. The page says what came of it; a
   * failure comes back as a reason, with nothing changed here.
   */
  async getUpdates(): Promise<UpdatesOutcome> {
    if (this.#disposed || this.#state.gettingUpdates) {
      return { kind: "failed", reason: updatesWords.alreadyWorking };
    }
    this.#set({ ...this.#state, gettingUpdates: true });
    try {
      let outcome: UpdatesOutcome = await this.source.getUpdates();
      if (outcome.kind === "both-moved") {
        const start = await this.source.startMerge();
        // Only when both sides moved is it chosen item by item; if that changed, the answer stays.
        if (start.kind === "started") outcome = { kind: "choosing" };
      }
      if (this.#disposed) return outcome;
      this.#set({ ...this.#state, gettingUpdates: false, choosing: outcome.kind === "choosing" });
      if (outcome.kind === "got" || outcome.kind === "choosing") await this.refresh();
      return outcome;
    } catch (error) {
      if (!this.#disposed) this.#set({ ...this.#state, gettingUpdates: false });
      return { kind: "failed", reason: loadFailureReason(error) };
    }
  }

  /** Whether a merge of both sides' versions is started: what waits for it is unavailable. */
  get merging(): boolean {
    return this.#state.merge !== undefined;
  }

  /** Makes `address` the place to share to; gives why it didn't work, or `undefined`. */
  addShareAddress(address: string): Promise<string | undefined> {
    return this.#sharing.addAddress(address);
  }

  /** Sends the versions the shared copy lacks: how many were sent, or why it didn't work. */
  share(): ReturnType<ShareSteps["share"]> {
    return this.#sharing.share();
  }

  /** Asks the shared copy for news again, after it couldn't be reached. */
  checkShared(): Promise<void> {
    this.#set({ ...this.#state, sharedCheck: { kind: "unknown" } });
    return this.#sharing.check();
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

/** The open workspace's {@link ChangesList}; the feature provides it from `ChangesSourceService`. */
export const ChangesListService: ServiceKey<ChangesList> =
  serviceKey<ChangesList>("source-control.list");
