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
   * The store's change to `path` didn't happen: it found the file changed
   * from outside and left it alone. That change is still to be reported, so
   * the mark is dropped without reading the file.
   */
  dropOwnChange(path: string): void {
    this.#own.delete(path);
  }

  /**
   * The files that changed at or under the names given, as one batch sorted
   * by path, and remembers how each is now. A name of `""` stands for the
   * whole workspace. A file that is now what the store is writing there is
   * left out.
   */
  async changesAt(names: readonly string[]): Promise<WorkspaceFileChange[]> {
    const reads = new BatchReads(this.#options.files);
    const changes = new Map<string, WorkspaceFileChange["kind"]>();
    for (const name of names) {
      for (const path of await this.#affectedPaths(name, reads)) {
        const kind = await this.#compare(path, reads);
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
    return await this.#rememberContent(path, await readUnlessRefused(this.#options.files, path));
  }

  /** Takes `content` as what `path` now holds, and gives its digest; `null` is no file. */
  async #rememberContent(path: string, content: string | null): Promise<string | undefined> {
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
  async #affectedPaths(name: string, reads: BatchReads): Promise<string[]> {
    const paths = new Set<string>();
    const prefix = name === "" ? "" : `${name}/`;
    for (const known of this.#digests.keys()) {
      if (known === name || known.startsWith(prefix)) {
        paths.add(known);
      }
    }
    for (const path of await this.#listUnder(name, reads)) {
      paths.add(path);
    }
    return [...paths];
  }

  /**
   * What the store holds at or under `name` now; nothing for a path it
   * refuses. `name` is read first: only when it holds no file is it listed
   * as a folder, so a changed file costs the store one call.
   */
  async #listUnder(name: string, reads: BatchReads): Promise<string[]> {
    const { files, isScratch } = this.#options;
    if (name === "") {
      return await files.list();
    }
    if (isScratch?.(name) === true) {
      return [];
    }
    try {
      if ((await reads.read(name)) !== null) {
        return [name];
      }
      return await files.list(name);
    } catch (error) {
      // A private entry, a link or a name a workspace path can't hold: not workspace content.
      if (error instanceof RangeError) {
        return [];
      }
      throw error;
    }
  }

  /** Whether `path` changed since it was last seen, and remembers how it is now. */
  async #compare(path: string, reads: BatchReads): Promise<WorkspaceFileChange["kind"] | null> {
    const before = this.#digests.get(path);
    const after = await this.#rememberContent(path, await reads.readUnlessRefused(path));
    if (after === before || this.#own.get(path) === (after ?? "absent")) {
      return null;
    }
    return after === undefined ? "removed" : "changed";
  }
}

/**
 * The store's reads while one batch is looked at, each path read once: the
 * text read to find out whether a name is a file is the text compared.
 */
class BatchReads {
  readonly #files: DefinitionSource;
  /** What each path read held, by path; a refused read is kept as its error. */
  readonly #reads = new Map<string, Promise<string | null>>();

  constructor(files: DefinitionSource) {
    this.#files = files;
  }

  /** The store's read of `path`, made once in this batch. */
  read(path: string): Promise<string | null> {
    let read = this.#reads.get(path);
    if (read === undefined) {
      read = this.#files.read(path);
      this.#reads.set(path, read);
    }
    return read;
  }

  /** {@link read}, with `null` when the store refuses the path, as it does a linked one. */
  readUnlessRefused(path: string): Promise<string | null> {
    return nullWhenRefused(this.read(path));
  }
}

/** The store's read of `path`, with `null` when the store refuses it, as it does a linked path. */
function readUnlessRefused(files: DefinitionSource, path: string): Promise<string | null> {
  return nullWhenRefused(files.read(path));
}

async function nullWhenRefused(read: Promise<string | null>): Promise<string | null> {
  try {
    return await read;
  } catch (error) {
    // The store refuses a linked path: for the workspace, the file is gone.
    if (error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}
