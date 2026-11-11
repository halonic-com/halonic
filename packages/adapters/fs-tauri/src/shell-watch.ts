import {
  checkPublicWorkspacePath,
  type DefinitionSource,
  type DefinitionWatch,
  type DefinitionWatchListener,
  type WorkspaceFileChange,
} from "@halonicjs/ports";
import { contentDigest, KindedError, type Sha256 } from "@halonicjs/std";
import type { TauriChannelHandle } from "./file-commands.ts";

/** What the store is about to leave at a path: the new text's digest, or `absent` for a remove. */
export type OwnChange = string | "absent";

/** The shell's id for an open `fs_watch`, which `fs_unwatch` takes back. */
export type WatchId = number;

/** How the shell's `fs_watch` is started and stopped; the store wraps its commands. */
export interface ShellWatchEvents {
  /** Opens a channel for the shell's messages. */
  openChannel(onMessage: (message: unknown) => void): TauriChannelHandle;
  /** Calls `fs_watch` with the channel and gives the watch's id. */
  start(channel: TauriChannelHandle): Promise<WatchId>;
  /** Calls `fs_unwatch`. */
  stop(watchId: WatchId): Promise<void>;
}

/** How a {@link ShellWatch} reads the workspace and hears the shell. */
export interface ShellWatchOptions {
  /** The store's read side, which checks paths as the port says. */
  readonly files: DefinitionSource;
  readonly digest: Sha256;
  readonly events: ShellWatchEvents;
  /**
   * The store's open watches. The watch is in it from when it is open until
   * it is closed or fails, so the store never tells a broken watch about its
   * own changes.
   */
  readonly openWatches: Set<ShellWatch>;
}

/**
 * One open watch of a workspace through the shell's `fs_watch`. The shell
 * only says which files may have changed; this watch reads each of them and
 * compares its digest with the one it last saw, as `FolderWatch` in
 * `fs-node` does, so a batch holds only files whose text really differs.
 * The store tells it before and after each of its own writes and removes,
 * so those are never reported.
 *
 * The shell's batches are read one at a time, in order, after the first
 * listing, so a batch never compares against a half-read workspace.
 */
export class ShellWatch implements DefinitionWatch {
  readonly #options: ShellWatchOptions;
  readonly #listener: DefinitionWatchListener;
  /** The digest of every file as last seen, by path. */
  readonly #known = new Map<string, string>();
  /** The store's own changes still in progress, by path. */
  readonly #own = new Map<string, OwnChange>();
  #channel: TauriChannelHandle | undefined;
  /** The shell's watch id once `fs_watch` answered, or `undefined` when it failed. */
  #watchId: Promise<WatchId | undefined> = Promise.resolve(undefined);
  /** The listing and batches being read, in order, so `close()` can wait for them. */
  #reading: Promise<void> = Promise.resolve();
  /**
   * Set by `close()`: the shell's messages are no longer heard. A batch
   * already being read still reports, before `close()` resolves.
   */
  #stopping = false;

  /** Use {@link ShellWatch.open}, which starts the shell's watch and reads the workspace first. */
  private constructor(options: ShellWatchOptions, listener: DefinitionWatchListener) {
    this.#options = options;
    this.#listener = listener;
  }

  /** Starts the shell's watch, then reads every file's digest. */
  static async open(
    options: ShellWatchOptions,
    listener: DefinitionWatchListener,
  ): Promise<ShellWatch> {
    const watch = new ShellWatch(options, listener);
    const { events } = options;
    // Listening starts first, so a change made while the workspace is read is not missed.
    const channel = events.openChannel((message) => watch.#receive(message));
    watch.#channel = channel;
    const started = events.start(channel);
    watch.#watchId = started.catch(() => undefined);
    const listed = started.then(() => watch.#rememberAll());
    watch.#reading = listed.catch(() => {});
    try {
      await listed;
    } catch (error) {
      // The watch never opened: it must not keep listening.
      await watch.close();
      throw error;
    }
    // A watch the shell stopped while the workspace was read is already closed.
    if (!watch.#stopping) {
      options.openWatches.add(watch);
    }
    return watch;
  }

  /** The store is about to write or remove `path`: what it leaves there is not a change from outside. */
  beginOwnChange(path: string, change: OwnChange): void {
    this.#own.set(path, change);
  }

  /**
   * The store's change to `path` is on disk, or failed: what is there now is
   * what the store knows. Never rejects: the store's change is done either
   * way, so a failure to read it back breaks the watch, not the write.
   */
  async endOwnChange(path: string): Promise<void> {
    this.#own.delete(path);
    try {
      await this.#remember(path);
    } catch (error) {
      this.#fail(asError(error));
    }
  }

  /**
   * The store's change to `path` didn't happen: the shell found the file
   * changed on disk. What is there is a change from outside, which the next
   * batch reports, so the watch forgets the mark without reading the file.
   */
  async dropOwnChange(path: string): Promise<void> {
    this.#own.delete(path);
  }

  /** Stops the shell's watch, lets a batch already being read finish, then reports nothing more. */
  async close(): Promise<void> {
    if (this.#stopping) {
      await this.#reading;
      return;
    }
    this.#stopping = true;
    this.#options.openWatches.delete(this);
    this.#channel?.close();
    const watchId = await this.#watchId;
    if (watchId !== undefined) {
      try {
        await this.#options.events.stop(watchId);
      } catch {
        // The channel is closed, so nothing more is heard from the shell either way.
      }
    }
    await this.#reading;
  }

  #receive(message: unknown): void {
    if (this.#stopping) {
      return;
    }
    const { type, paths, message: reason } = (message ?? {}) as Record<string, unknown>;
    if (type === "changed" && Array.isArray(paths) && paths.every(isString)) {
      // One batch at a time, so two never update what the watch knows at once.
      this.#reading = this.#reading
        .then(() => this.#readBatch(paths))
        .catch((error: unknown) => this.#fail(asError(error)));
    } else if (type === "failed" && typeof reason === "string") {
      this.#fail(new KindedError("unavailable", `The workspace watch stopped: ${reason}`));
    } else {
      this.#fail(
        new KindedError("unavailable", "The desktop shell sent a watch message that isn't one."),
      );
    }
  }

  async #rememberAll(): Promise<void> {
    for (const path of await this.#options.files.list()) {
      await this.#remember(path);
    }
  }

  async #readBatch(paths: readonly string[]): Promise<void> {
    const changes = new Map<string, WorkspaceFileChange["kind"]>();
    for (const path of new Set(paths)) {
      // A private entry or a name a workspace path can't hold is never workspace content.
      if (!isPublicWorkspacePath(path)) {
        continue;
      }
      const kind = await this.#compare(path);
      if (kind !== null) {
        changes.set(path, kind);
      }
    }
    if (changes.size === 0) {
      return;
    }
    const batch = [...changes]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, kind]) => ({ path, kind }));
    this.#listener.changed(batch);
  }

  /** Whether `path` changed since it was last seen, and remembers how it is now. */
  async #compare(path: string): Promise<WorkspaceFileChange["kind"] | null> {
    const before = this.#known.get(path);
    const after = await this.#remember(path);
    if (after === before || this.#own.get(path) === (after ?? "absent")) {
      return null;
    }
    return after === undefined ? "removed" : "changed";
  }

  /**
   * Reads `path`'s digest into what the watch knows, and gives it;
   * `undefined` when there is no file, or only one behind a link.
   */
  async #remember(path: string): Promise<string | undefined> {
    const content = await this.#readUnlessLinked(path);
    if (content === null) {
      this.#known.delete(path);
      return undefined;
    }
    const digest = await contentDigest(content, this.#options.digest);
    this.#known.set(path, digest);
    return digest;
  }

  /** The store's read of `path`, with `null` when it or a folder on the way is now a link. */
  async #readUnlessLinked(path: string): Promise<string | null> {
    try {
      return await this.#options.files.read(path);
    } catch (error) {
      // The store refuses a linked path: for the workspace, the file is gone.
      if (error instanceof RangeError) {
        return null;
      }
      throw error;
    }
  }

  #fail(error: Error): void {
    if (this.#stopping) {
      return;
    }
    // Stops hearing the shell now; a batch being read may still finish.
    void this.close();
    this.#listener.failed(error);
  }
}

function isPublicWorkspacePath(path: string): boolean {
  try {
    checkPublicWorkspacePath(path);
    return true;
  } catch {
    return false;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
