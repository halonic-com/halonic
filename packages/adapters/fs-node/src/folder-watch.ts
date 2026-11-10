import { watch as watchFolder } from "node:fs";
import type {
  DefinitionSource,
  DefinitionWatch,
  DefinitionWatchListener,
  WorkspaceFileChange,
} from "@halonicjs/ports";
import { contentDigest, type Sha256 } from "@halonicjs/std";
import { isTemporaryWrite } from "./temporary-write.ts";

/** What the store is about to leave at a path: the new text's digest, or `absent` for a remove. */
export type OwnChange = string | "absent";

/**
 * Starts telling `noticed` the names (relative to `root`, with the system's
 * separator) of entries that may have changed, and gives a function that
 * stops it. The default is `node:fs.watch`, recursive; tests pass their own.
 */
export type FolderEvents = (
  root: string,
  noticed: (name: string) => void,
  failed: (error: Error) => void,
) => () => void;

/** `node:fs.watch` on the whole folder. Node watches subfolders itself on Linux, macOS and Windows. */
export const nodeFolderEvents: FolderEvents = (root, noticed, failed) => {
  const watcher = watchFolder(root, { recursive: true }, (_event, name) => {
    // Node may give no name when the system doesn't say which entry changed.
    noticed(name ?? "");
  });
  watcher.on("error", failed);
  return () => watcher.close();
};

/** How a {@link FolderWatch} reads the folder and is told about events. */
export interface FolderWatchOptions {
  readonly root: string;
  /** The store's read side: it checks paths and never follows a link. */
  readonly files: DefinitionSource;
  readonly digest: Sha256;
  readonly events: FolderEvents;
  /** How long the folder stays quiet before a batch is reported. */
  readonly quietMs: number;
}

/**
 * One open watch of a workspace folder. It keeps the digest of every file it
 * has seen, so a batch holds only files whose text really differs. The
 * store tells it before and after each of its own writes and removes, so
 * those are never reported, even when a batch is read in between. Events are gathered until the folder has been quiet for
 * `quietMs`, then every path they name is read once, so a file removed and
 * created again comes out as `changed`.
 */
export class FolderWatch implements DefinitionWatch {
  readonly #options: FolderWatchOptions;
  readonly #listener: DefinitionWatchListener;
  /** The digest of every file as last seen, by path. */
  readonly #known = new Map<string, string>();
  /** The store's own changes still in progress, by path. */
  readonly #own = new Map<string, OwnChange>();
  readonly #noticed = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopEvents: (() => void) | undefined;
  /** Set by `close()`: events are no longer heard. */
  #stopping = false;
  /** Set once `close()` is done: nothing more is reported. */
  #closed = false;
  /** The batch being read, so `close()` can wait for it. */
  #flushing: Promise<void> = Promise.resolve();

  /** Use {@link FolderWatch.open}, which reads the folder first. */
  private constructor(options: FolderWatchOptions, listener: DefinitionWatchListener) {
    this.#options = options;
    this.#listener = listener;
  }

  /** Reads every file's digest, then starts listening for events. */
  static async open(
    options: FolderWatchOptions,
    listener: DefinitionWatchListener,
  ): Promise<FolderWatch> {
    const watch = new FolderWatch(options, listener);
    // Listening starts first, so a change made while the folder is read is not missed.
    watch.#stopEvents = options.events(
      options.root,
      (name) => watch.#notice(name),
      (error) => watch.#fail(error),
    );
    for (const path of await options.files.list()) {
      await watch.#remember(path);
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

  /** Stops hearing events, lets a batch already being read finish, then reports nothing more. */
  async close(): Promise<void> {
    this.#stopping = true;
    clearTimeout(this.#timer);
    this.#stopEvents?.();
    await this.#flushing;
    this.#closed = true;
  }

  #notice(name: string): void {
    if (this.#stopping) {
      return;
    }
    // An event without a name could be anywhere: check every file.
    this.#noticed.add(name.split("\\").join("/"));
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
    const changes = new Map<string, WorkspaceFileChange["kind"]>();
    for (const name of noticed) {
      for (const path of await this.#affectedPaths(name)) {
        const kind = await this.#compare(path);
        if (kind !== null) {
          changes.set(path, kind);
        }
      }
    }
    if (changes.size === 0 || this.#closed) {
      return;
    }
    const batch = [...changes]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, kind]) => ({ path, kind }));
    this.#listener.changed(batch);
  }

  /**
   * The workspace paths an event on `name` may have touched: the file
   * itself, everything under it when it is (or was) a folder, nothing for a
   * private entry, a link or a temporary write.
   */
  async #affectedPaths(name: string): Promise<string[]> {
    const paths = new Set<string>();
    const prefix = name === "" ? "" : `${name}/`;
    for (const known of this.#known.keys()) {
      if (known === name || known.startsWith(prefix)) {
        paths.add(known);
      }
    }
    for (const path of await this.#listUnder(name)) {
      paths.add(path);
    }
    return [...paths];
  }

  /** What the store lists at or under `name` now; nothing for a path it refuses. */
  async #listUnder(name: string): Promise<string[]> {
    if (name === "") {
      return await this.#options.files.list();
    }
    if (isTemporaryWrite(name)) {
      return [];
    }
    try {
      const under = await this.#options.files.list(name);
      return (await this.#options.files.read(name)) === null ? under : [name];
    } catch (error) {
      // A private entry, a link or a name a workspace path can't hold: not workspace content.
      if (error instanceof RangeError) {
        return [];
      }
      throw error;
    }
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
    // Stops hearing events now; a batch being read may still finish.
    void this.close();
    this.#listener.failed(error);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
