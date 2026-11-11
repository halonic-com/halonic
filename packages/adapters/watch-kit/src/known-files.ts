import type { DefinitionSource, WorkspaceFileChange } from "@halonicjs/ports";
import { contentDigest, type Sha256 } from "@halonicjs/std";

/** What the store is about to leave at a path: the new text's digest, or `absent` for a remove. */
export type OwnChange = string | "absent";

/** How {@link KnownFiles} reads the workspace. */
export interface KnownFilesOptions {
  /** The store's read side: it checks paths and refuses a private or linked one with a `RangeError`. */
  readonly files: DefinitionSource;
  readonly digest: Sha256;
  /**
   * Whether a name is one the store only writes on the way to a file, such
   * as a temporary file it renames into place. Such a name is never
   * workspace content. None by default.
   */
  readonly isScratch?: (name: string) => boolean;
}

/**
 * What a watch knows about the workspace: the digest of every file as last
 * seen, and the store's own changes still in progress. It turns the names an
 * event source gives into the files whose text really changed since.
 */
export class KnownFiles {
  readonly #options: KnownFilesOptions;
  /** The digest of every file as last seen, by path. */
  readonly #digests = new Map<string, string>();
  /** The store's own changes still in progress, by path. */
  readonly #own = new Map<string, OwnChange>();

  constructor(options: KnownFilesOptions) {
    this.#options = options;
  }

  /** Reads the digest of every file the store lists. */
  async rememberAll(): Promise<void> {
    for (const path of await this.#options.files.list()) {
      await this.remember(path);
    }
  }

  /** The store is about to write or remove `path`: what it leaves there is not a change from outside. */
  beginOwnChange(path: string, change: OwnChange): void {
    this.#own.set(path, change);
  }

  /**
   * The store's change to `path` is over. When it was `applied`, what the
   * store left there is taken as seen without reading the file again: a read
   * now could take in a change from outside made right after it, which would
   * then never be reported. When it failed, the file is read back.
   */
  async endOwnChange(path: string, applied: boolean): Promise<void> {
    const change = this.#own.get(path);
    this.#own.delete(path);
    if (!applied || change === undefined) {
      await this.remember(path);
      return;
    }
    if (change === "absent") {
      this.#digests.delete(path);
    } else {
      this.#digests.set(path, change);
    }
  }

  /**
   * The files that changed at or under the names given, as one batch sorted
   * by path, and remembers how each is now. A name of `""` stands for the
   * whole workspace. A file that is now what the store is writing there is
   * left out.
   */
  async changesAt(names: readonly string[]): Promise<WorkspaceFileChange[]> {
    const changes = new Map<string, WorkspaceFileChange["kind"]>();
    for (const name of names) {
      for (const path of await this.#affectedPaths(name)) {
        const kind = await this.#compare(path);
        if (kind !== null) {
          changes.set(path, kind);
        }
      }
    }
    return [...changes]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, kind]) => ({ path, kind }));
  }

  /**
   * Reads `path`'s digest into what the watch knows, and gives it;
   * `undefined` when there is no file, or only one behind a link.
   */
  async remember(path: string): Promise<string | undefined> {
    const content = await this.#readUnlessRefused(path);
    if (content === null) {
      this.#digests.delete(path);
      return undefined;
    }
    const digest = await contentDigest(content, this.#options.digest);
    this.#digests.set(path, digest);
    return digest;
  }

  /**
   * The workspace paths an event on `name` may have touched: the file
   * itself, everything under it when it is (or was) a folder, nothing for a
   * private entry, a link or a scratch file.
   */
  async #affectedPaths(name: string): Promise<string[]> {
    const paths = new Set<string>();
    const prefix = name === "" ? "" : `${name}/`;
    for (const known of this.#digests.keys()) {
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
    const { files, isScratch } = this.#options;
    if (name === "") {
      return await files.list();
    }
    if (isScratch?.(name) === true) {
      return [];
    }
    try {
      const under = await files.list(name);
      return (await files.read(name)) === null ? under : [name];
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
    const before = this.#digests.get(path);
    const after = await this.remember(path);
    if (after === before || this.#own.get(path) === (after ?? "absent")) {
      return null;
    }
    return after === undefined ? "removed" : "changed";
  }

  /** The store's read of `path`, with `null` when the store refuses it, as it does a linked path. */
  async #readUnlessRefused(path: string): Promise<string | null> {
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
}
