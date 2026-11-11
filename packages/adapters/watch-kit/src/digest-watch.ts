import {
  type DefinitionWatch,
  type DefinitionWatchListener,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";
import { KnownFiles, type KnownFilesOptions, type OwnChange } from "./known-files.ts";

/**
 * Starts telling `noticed` the workspace paths (with `/`) of entries that
 * may have changed, and gives a function that stops it. `""` means it
 * can't say which: every file is checked. Each store brings its own: file
 * system events, the desktop shell's messages, or the page getting focus.
 */
export type WatchEvents = (
  noticed: (name: string) => void,
  failed: (error: Error) => void,
) => () => void;

/** How a {@link DigestWatch} reads the workspace and is told about events. */
export interface DigestWatchOptions extends KnownFilesOptions {
  readonly events: WatchEvents;
  /** How long the events stay quiet before a batch is reported. */
  readonly quietMs: number;
  /**
   * The store's open watches. The watch is in it from before it first reads
   * the workspace until it is closed or fails, so the store tells it about
   * every change it starts meanwhile, and never tells a broken watch.
   */
  readonly openWatches: Set<DigestWatch>;
}

/**
 * One open watch of a workspace whose store can only say which entries may
 * have changed. It keeps the digest of every file it has seen, so a batch
 * holds only files whose text really differs. The store tells it before and
 * after each of its own writes and removes, so those are never reported,
 * even when a batch is read in between. Events are gathered until they have
 * been quiet for `quietMs`, then every path they name is read once, so a
 * file removed and created again comes out as `changed`.
 */
export class DigestWatch implements DefinitionWatch {
  readonly #options: DigestWatchOptions;
  readonly #listener: DefinitionWatchListener;
  readonly #known: KnownFiles;
  readonly #noticed = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopEvents: (() => void) | undefined;
  /** Set by `close()`: events are no longer heard. */
  #stopping = false;
  /** Set once `close()` is done: nothing more is reported. */
  #closed = false;
  /**
   * The end of the work queued on what the watch knows: the first reading,
   * batches and the store's own changes ending. `close()` waits for it.
   */
  #queued: Promise<void> = Promise.resolve();

  /** Use {@link DigestWatch.open}, which reads the workspace first. */
  private constructor(options: DigestWatchOptions, listener: DefinitionWatchListener) {
    this.#options = options;
    this.#listener = listener;
    this.#known = new KnownFiles(options);
  }

  /** Starts listening for events, then reads every file's digest. */
  static async open(
    options: DigestWatchOptions,
    listener: DefinitionWatchListener,
  ): Promise<DigestWatch> {
    const watch = new DigestWatch(options, listener);
    // Joined and listening first, so neither a change from outside nor the
    // store's own change made while the workspace is read is missed. A change
    // the store started before this can still be reported once.
    options.openWatches.add(watch);
    watch.#stopEvents = options.events(
      (name) => watch.#notice(name),
      (error) => watch.#fail(error),
    );
    try {
      await watch.#inTurn(() => watch.#known.rememberAll());
    } catch (error) {
      // The watch never opened: it must not keep listening.
      await watch.close();
      throw error;
    }
    return watch;
  }

  /** The store is about to write or remove `path`: what it leaves there is not a change from outside. */
  beginOwnChange(path: string, change: OwnChange): void {
    this.#known.beginOwnChange(path, change);
  }

  /**
   * The store's change to `path` is over: `applied` when it happened, so the
   * watch takes what the store left there as seen, or not, so the watch reads
   * the file back. It waits its turn after the batches already queued. Never
   * rejects: the store's change is over either way, so a failure to read the
   * file back breaks the watch, not the write.
   */
  async endOwnChange(path: string, applied: boolean): Promise<void> {
    try {
      await this.#inTurn(() => this.#known.endOwnChange(path, applied));
    } catch (error) {
      this.#fail(asError(error));
    }
  }

  /** Stops hearing events, lets a batch already being read finish, then reports nothing more. */
  async close(): Promise<void> {
    this.#stopping = true;
    this.#options.openWatches.delete(this);
    clearTimeout(this.#timer);
    this.#stopEvents?.();
    await this.#queued;
    this.#closed = true;
  }

  #notice(path: string): void {
    // A private entry (`.git`, the Studio's run logs) is never workspace
    // content, so it doesn't start a batch or read the workspace.
    if (this.#stopping || isPrivateWorkspacePath(path)) {
      return;
    }
    this.#noticed.add(path);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#inTurn(() => this.#flush()).catch((error: unknown) => this.#fail(asError(error)));
    }, this.#options.quietMs);
  }

  /**
   * Runs `task` once everything queued before it is done, so two never
   * update what the watch knows at once, and an older read never lands over
   * a newer one. The caller handles the task's failure; the queue goes on.
   */
  #inTurn(task: () => Promise<void>): Promise<void> {
    const run = this.#queued.then(task);
    this.#queued = run.catch(() => undefined);
    return run;
  }

  async #flush(): Promise<void> {
    const noticed = [...this.#noticed];
    this.#noticed.clear();
    const batch = await this.#known.changesAt(noticed);
    if (batch.length === 0 || this.#closed) {
      return;
    }
    this.#listener.changed(batch);
  }

  #fail(error: Error): void {
    if (this.#stopping) {
      return;
    }
    // Stops hearing events now; a batch being read may still finish.
    void this.close();
    this.#listener.failed(error);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
