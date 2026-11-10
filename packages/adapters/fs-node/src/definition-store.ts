import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  checkPublicWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type DefinitionWatchListener,
  type Digest,
  isPrivateWorkspacePath,
  UnreadableWorkspaceFolderError,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { bytesToHex, contentDigest, KeyedQueue, matchesExpected } from "@halonicjs/std";
import {
  type FolderEvents,
  FolderWatch,
  nodeFolderEvents,
  type OwnChange,
} from "./folder-watch.ts";
import { entryAt, isMissing } from "./links.ts";
import { renameOver } from "./rename-over.ts";
import { isTemporaryWrite, temporaryWriteFileName } from "./temporary-write.ts";

/** The Web Crypto API that Node has, as the {@link Digest} port. */
const webCryptoDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * The error for a write to a path that is a folder: `EISDIR`, as Linux and
 * macOS give it. Windows would refuse the rename with `EPERM`, which reads
 * as a busy file and is retried, so the store checks first and gives the
 * same error everywhere.
 */
function folderInTheWay(file: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`EISDIR: illegal operation on a directory, write '${file}'`), {
    code: "EISDIR",
    syscall: "write",
    path: file,
  });
}

/** How long the folder must be quiet before a watch reports a batch, by default. */
const defaultQuietMs = 100;

/** Options for a {@link FolderDefinitionStore}'s `watch()`; tests change them. */
export interface FolderStoreWatchOptions {
  /** Where events come from; `node:fs.watch`, recursive, by default. */
  readonly events?: FolderEvents;
  /** How long the folder must be quiet before a batch is reported. */
  readonly quietMs?: number;
}

/**
 * Workspace files as plain files under a root folder: what the CLI and
 * `halonic serve` read on a machine. Paths are checked like every other
 * store's (see the port). It never follows a symbolic link or a Windows
 * junction: one in any segment of a path is refused, and `list()` leaves
 * links out with everything under them.
 *
 * A write goes to a temporary file in the same folder that is then renamed
 * over the file, so another program reads the old text or the new, never
 * half of it. Writes to one path run one after another, so the check for
 * `expected` and its write are never split by another write from this
 * store. A program outside Halonic can still change the file between the
 * check and the rename; that gap is a few milliseconds and the watcher
 * reports such a change.
 */
export class FolderDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #root: string;
  readonly #writes = new KeyedQueue();
  readonly #watches = new Set<FolderWatch>();
  readonly #watchOptions: Required<FolderStoreWatchOptions>;

  /**
   * @param root - the workspace folder; a relative one is resolved against the working directory
   * @param location - shown to people as where the files live; the root by default
   * @param watchOptions - how `watch()` hears about the folder and batches what it hears
   */
  constructor(root: string, location?: string, watchOptions: FolderStoreWatchOptions = {}) {
    this.#root = resolve(root);
    this.location = location ?? root;
    this.#watchOptions = {
      events: watchOptions.events ?? nodeFolderEvents,
      quietMs: watchOptions.quietMs ?? defaultQuietMs,
    };
  }

  async list(dir?: string): Promise<string[]> {
    const paths: string[] = [];
    if (dir === undefined) {
      await this.#collect(this.#root, "", paths);
    } else {
      checkPublicWorkspacePath(dir);
      if ((await entryAt(this.#root, dir))?.isDirectory()) {
        await this.#collect(join(this.#root, dir), dir, paths);
      }
    }
    return paths.sort();
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    if (!(await entryAt(this.#root, path))?.isFile()) {
      return null;
    }
    return await readFile(join(this.#root, path), "utf8");
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    checkPublicWorkspacePath(path);
    return await this.#writes.run(path, async () => {
      const { expected } = options;
      if (expected !== undefined) {
        const current = await this.read(path);
        if (!(await matchesExpected(current, expected, webCryptoDigest))) {
          return { status: "changed-on-disk", current };
        }
      }
      await this.#ownChange(path, content, () => this.#replace(path, content));
      return { status: "written" };
    });
  }

  /** Writes `content` to a temporary file next to `path` and renames it over the file. */
  async #replace(path: string, content: string): Promise<void> {
    // Checks the folders on the way and the file itself, so the write can't land behind a link.
    const existing = await entryAt(this.#root, path);
    const file = join(this.#root, path);
    if (existing?.isDirectory()) {
      throw folderInTheWay(file);
    }
    const folder = dirname(file);
    await mkdir(folder, { recursive: true });
    const temporary = join(folder, temporaryWriteFileName());
    try {
      await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
      if (existing !== null) {
        // A replaced file keeps its permissions, such as a script's execute bit.
        await chmod(temporary, existing.mode & 0o7777);
      }
      // Retries briefly on Windows while a scanner or indexer holds the file.
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    await this.#writes.run(path, async () => {
      if (!(await entryAt(this.#root, path))?.isFile()) {
        return;
      }
      // `force`: a file another program removed in the meantime is not an error.
      await this.#ownChange(path, null, () => rm(join(this.#root, path), { force: true }));
    });
  }

  /**
   * Reports changes from outside Halonic, as the port says. Events from
   * `node:fs.watch` are gathered until the folder has been quiet for a
   * moment (100 ms by default), so a checkout comes as one batch.
   */
  async watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    // The watch adds itself to `#watches` once open and takes itself out when it closes or fails.
    return await FolderWatch.open(
      {
        root: this.#root,
        files: this,
        digest: webCryptoDigest,
        openWatches: this.#watches,
        ...this.#watchOptions,
      },
      listener,
    );
  }

  /**
   * Runs one of the store's own changes to `path`, which leaves `content`
   * there (`null` for a remove), so no open watch reports it.
   */
  async #ownChange(
    path: string,
    content: string | null,
    apply: () => Promise<void>,
  ): Promise<void> {
    const watches = [...this.#watches];
    if (watches.length > 0) {
      const change: OwnChange =
        content === null ? "absent" : await contentDigest(content, webCryptoDigest);
      for (const watch of watches) {
        watch.beginOwnChange(path, change);
      }
    }
    try {
      await apply();
    } finally {
      for (const watch of watches) {
        await watch.endOwnChange(path);
      }
    }
  }

  /**
   * `sha256:` and the first 16 hex characters of a hash over every file it
   * serves and its text, worked out as the memory adapter does, so the same
   * files give the same version in both.
   */
  async version(): Promise<string> {
    const parts: string[] = [];
    for (const path of await this.list()) {
      const content = await this.read(path);
      if (content !== null) {
        parts.push(`${path}\n${content}`);
      }
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(parts.join("\n\0")),
    );
    return `sha256:${bytesToHex(new Uint8Array(digest)).slice(0, 16)}`;
  }

  /**
   * Adds the files under `folder`, whose workspace path is `prefix`, to
   * `into`, leaving out links and private entries.
   *
   * @throws UnreadableWorkspaceFolderError naming a folder under the root
   *   that the account may not read
   */
  async #collect(folder: string, prefix: string, into: string[]): Promise<void> {
    const entries = await entriesOf(folder, prefix);
    for (const entry of entries) {
      // A backslash is allowed in a file name on Linux, but not in a workspace path.
      if (
        entry.isSymbolicLink() ||
        entry.name.includes("\\") ||
        isTemporaryWrite(entry.name) ||
        isPrivateWorkspacePath(entry.name)
      ) {
        continue;
      }
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await this.#collect(join(folder, entry.name), path, into);
      } else if (entry.isFile()) {
        into.push(path);
      }
    }
  }
}

/**
 * The entries of `folder`, whose workspace path is `prefix`, or none when it
 * doesn't exist.
 *
 * @throws UnreadableWorkspaceFolderError when the account may not read a
 *   folder under the root
 */
async function entriesOf(folder: string, prefix: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    // The root itself has no workspace path to name: its error goes on as it is.
    if (prefix !== "" && isRefused(error)) {
      throw new UnreadableWorkspaceFolderError(
        prefix,
        `The workspace folder ${prefix} can't be read.`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Whether the file system refused the account: `EACCES` on Linux and macOS, `EPERM` on Windows. */
function isRefused(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EACCES" || code === "EPERM";
}
