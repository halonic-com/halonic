import { createHash, type Hash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DigestWatch, runOwnChange } from "@halonicjs/adapter-watch-kit";
import {
  checkLeaveOut,
  checkPublicWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type DefinitionWatchListener,
  type Digest,
  isLeftOut,
  isPrivateWorkspacePath,
  type LeaveOut,
  type ListOptions,
  type RemoveOptions,
  type RemoveResult,
  UnreadableWorkspaceFolderError,
  type VersionOptions,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { KeyedQueue, matchesExpected } from "@halonicjs/std";
import { writeFlushedFile } from "./flushed-write.ts";
import { type FolderEvents, folderWatchEvents, nodeFolderEvents } from "./folder-watch.ts";
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

/**
 * What the watch never reads or reports: installed packages hold tens of
 * thousands of files and no definitions, and Studio's file tree hides them.
 */
const watchLeavesOut: LeaveOut = { names: ["node_modules"] };

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
  readonly #watches = new Set<DigestWatch>();
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

  /**
   * With `leaveOut`, the walk never steps into a left-out folder, so a
   * working folder's files are neither listed nor looked at.
   */
  async list(dir?: string, options: ListOptions = {}): Promise<string[]> {
    const { leaveOut } = options;
    checkLeaveOut(leaveOut);
    const paths: string[] = [];
    const add = (path: string) => {
      paths.push(path);
      return true;
    };
    if (dir === undefined) {
      await this.#walk(this.#root, "", add, leaveOut);
    } else {
      checkPublicWorkspacePath(dir);
      if (!isLeftOut(dir, leaveOut) && (await entryAt(this.#root, dir))?.isDirectory()) {
        await this.#walk(join(this.#root, dir), dir, add, leaveOut);
      }
    }
    return paths.sort();
  }

  /**
   * Whether the root holds more than `limit` of the files `list()` gives.
   * It stops counting at the first file over the limit, so a very large
   * folder costs no more than `limit` files' worth of looking.
   *
   * @example
   * await store.hasMoreFilesThan(50_000); // false for a workspace of hubs and agents
   */
  async hasMoreFilesThan(limit: number): Promise<boolean> {
    let count = 0;
    await this.#walk(this.#root, "", () => {
      count += 1;
      return count <= limit;
    });
    return count > limit;
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
      await runOwnChange(this.#watches, path, content, webCryptoDigest, async () => {
        await this.#replace(path, content);
        return true;
      });
      return { status: "written" };
    });
  }

  /** Writes `content` to a temporary file next to `path`, flushed to disk, and renames it over the file. */
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
      await writeFlushedFile(temporary, content);
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

  async remove(path: string, options: RemoveOptions = {}): Promise<RemoveResult> {
    checkPublicWorkspacePath(path);
    return await this.#writes.run(path, async () => {
      const { expected } = options;
      if (expected !== undefined) {
        const current = await this.read(path);
        if (!(await matchesExpected(current, expected, webCryptoDigest))) {
          return { status: "changed-on-disk", current };
        }
      }
      if (!(await entryAt(this.#root, path))?.isFile()) {
        return { status: "removed" };
      }
      // `force`: a file another program removed in the meantime is not an error.
      await runOwnChange(this.#watches, path, null, webCryptoDigest, async () => {
        await rm(join(this.#root, path), { force: true });
        return true;
      });
      return { status: "removed" };
    });
  }

  /**
   * Reports changes from outside Halonic, as the port says. Events from
   * `node:fs.watch` are gathered until the folder has been quiet for a
   * moment (100 ms by default), so a checkout comes as one batch.
   */
  async watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    // The watch adds itself to `#watches` once open and takes itself out when it closes or fails.
    return await DigestWatch.open(
      {
        files: this,
        digest: webCryptoDigest,
        events: folderWatchEvents(this.#root, this.#watchOptions.events),
        quietMs: this.#watchOptions.quietMs,
        isScratch: isTemporaryWrite,
        leaveOut: watchLeavesOut,
        openWatches: this.#watches,
      },
      listener,
    );
  }

  /**
   * `sha256:` and the first 16 hex characters of a hash over every file
   * `list()` gives with the same `leaveOut`, and its text, worked out as the
   * memory adapter does, so the same files give the same version in both.
   *
   * The hash takes in one file and one piece of it at a time: an agent's
   * working folder with its installed packages holds more text than one
   * string can (HAL-13291).
   */
  async version(options: VersionOptions = {}): Promise<string> {
    const hash = createHash("sha256");
    let separator = "";
    for (const path of await this.list(undefined, options)) {
      // As `read()` does: a file removed since `list()`, or swapped for a link, isn't served.
      if (!(await entryAt(this.#root, path))?.isFile()) {
        continue;
      }
      hash.update(`${separator}${path}\n`);
      await hashText(join(this.#root, path), hash);
      separator = "\n\0";
    }
    return `sha256:${hash.digest("hex").slice(0, 16)}`;
  }

  /**
   * Gives `visit` the workspace path of each file under `folder`, whose
   * workspace path is `prefix`, leaving out links, private entries and what
   * `leaveOut` names, without stepping into a left-out folder. The
   * shell's folder watch leaves out the same (`walk` in the
   * `workspace-files` crate), so the doctor counts the files Studio would
   * watch.
   *
   * @param visit takes a file's path and returns `false` to stop the walk
   * @returns `false` when `visit` stopped it
   * @throws UnreadableWorkspaceFolderError naming a folder under the root
   *   that the account may not read
   */
  async #walk(
    folder: string,
    prefix: string,
    visit: (path: string) => boolean,
    leaveOut?: LeaveOut,
  ): Promise<boolean> {
    const entries = await entriesOf(folder, prefix);
    for (const entry of entries) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (isNeverListed(entry) || isLeftOut(path, leaveOut)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!(await this.#walk(join(folder, entry.name), path, visit, leaveOut))) {
          return false;
        }
      } else if (entry.isFile() && !visit(path)) {
        return false;
      }
    }
    return true;
  }
}

/** Whether `list()` leaves an entry out whatever the caller asks: a link, a private entry or a scratch file. */
function isNeverListed(entry: Dirent): boolean {
  // A backslash is allowed in a file name on Linux, but not in a workspace path.
  return (
    entry.isSymbolicLink() ||
    entry.name.includes("\\") ||
    isTemporaryWrite(entry.name) ||
    isPrivateWorkspacePath(entry.name)
  );
}

/**
 * Adds the text of `file` to `hash` piece by piece, as `read()` would give
 * it: decoded as UTF-8, a byte order mark kept and bytes that aren't UTF-8
 * replaced, so the hash matches one over the whole text.
 */
async function hashText(file: string, hash: Hash): Promise<void> {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  for await (const piece of createReadStream(file)) {
    hash.update(decoder.decode(piece as Buffer, { stream: true }));
  }
  hash.update(decoder.decode());
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
