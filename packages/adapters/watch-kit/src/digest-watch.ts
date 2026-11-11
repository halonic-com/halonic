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
   * The store's open watches. The watch is in it from when it is open until
   * it is closed or fails, so the store never tells a broken watch about its
   * own changes.
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
  /** The batch being read, so `close()` can wait for it. */
  #flushing: Promise<void> = Promise.resolve();

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
    // Listening starts first, so a change made while the workspace is read is not missed.
    watch.#stopEvents = options.events(
      (name) => watch.#notice(name),
      (error) => watch.#fail(error),
    );
    try {
      await watch.#known.rememberAll();
    } catch (error) {
      // The watch never opened: it must not keep listening.
      await watch.close();
      throw error;
    }
    // An event source that failed while the workspace was read already closed the watch.
    if (!watch.#stopping) {
      options.openWatches.add(watch);
    }
    return watch;
  }

  /** The store is about to write or remove `path`: what it leaves there is not a change from outside. */
  beginOwnChange(path: string, change: OwnChange): void {
    this.#known.beginOwnChange(path, change);
  }

  /**
   * The store's change to `path` is done, or failed: what is there now is
   * what the store knows. Never rejects: the store's change is done either
   * way, so a failure to read it back breaks the watch, not the write.
   */
  async endOwnChange(path: string): Promise<void> {
    this.#known.endOwnChange(path);
    try {
      await this.#known.remember(path);
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
    await this.#flushing;
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
      // One batch at a time, so two never update what the watch knows at once.
      this.#flushing = this.#flushing
        .then(() => this.#flush())
        .catch((error: unknown) => this.#fail(asError(error)));
    }, this.#options.quietMs);
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
