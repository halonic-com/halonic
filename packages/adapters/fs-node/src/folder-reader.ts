import { constants, type Stats } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
} from "@halonicjs/ports";
import { entryAt, isMissing, lstatOrNull } from "./links.ts";

/**
 * Opens without following a link at the last segment, and without waiting on
 * a pipe that was swapped in after the check. Windows has neither flag; there
 * `lstat` refuses links and junctions, and the handle is checked again below.
 */
const openFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Every entry and byte of a folder on this machine, for the plugin service
 * (requirement `fs-node.folder-reader`). The folder itself may be reached
 * through a link, as a `plugins` folder kept with dotfiles often is. Every
 * segment under it is looked at with `lstat`, so a symbolic link or a Windows
 * junction inside is listed as a link and never followed, and nothing is
 * hidden.
 *
 * A file is read from one open handle that is checked to be the same
 * regular file `lstat` saw, so a file swapped for a link or a pipe between
 * the check and the open is refused rather than read.
 */
export class FileSystemFolderReader implements FolderReader {
  readonly location: string;
  readonly #root: string;

  /**
   * @param root - the folder; a relative one is resolved against the working directory
   * @param location - shown to people as where the folder is; the root by default
   */
  constructor(root: string, location?: string) {
    this.#root = resolve(root);
    this.location = location ?? root;
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    let start = this.#root;
    if (dir !== undefined) {
      checkWorkspacePath(dir);
      const stats = await entryAt(this.#root, dir);
      if (stats === null || !stats.isDirectory()) return [];
      start = join(this.#root, dir);
    } else if (!(await isFolderThroughLinks(this.#root))) {
      return [];
    }
    const found: FolderEntry[] = [];
    await this.#walk(start, dir, found, options.limit ?? Number.POSITIVE_INFINITY);
    return found.sort((left, right) => compareCodeUnits(left.path, right.path));
  }

  async read(path: string): Promise<Uint8Array | null> {
    checkWorkspacePath(path);
    const checked = await entryAt(this.#root, path);
    if (checked === null || checked.isDirectory()) return null;
    if (!checked.isFile()) {
      throw new RangeError(
        `${JSON.stringify(path)} is a special file: the reader never opens one.`,
      );
    }
    const handle = await open(join(this.#root, path), openFlags);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || !sameFile(checked, opened)) {
        throw new RangeError(`${JSON.stringify(path)} changed while it was opened: read it again.`);
      }
      return new Uint8Array(await handle.readFile());
    } finally {
      await handle.close();
    }
  }

  async locationOf(path?: string): Promise<string | null> {
    if (path !== undefined) {
      checkWorkspacePath(path);
      if ((await entryAt(this.#root, path)) === null) return null;
    }
    try {
      return await realpath(path === undefined ? this.#root : join(this.#root, path));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  /**
   * Adds every entry under `folder` to `found`, depth first, until there are
   * more than `limit`. `relative` is the folder's path from the root, or
   * `undefined` for the root itself.
   */
  async #walk(
    folder: string,
    relative: string | undefined,
    found: FolderEntry[],
    limit: number,
  ): Promise<void> {
    let names: string[];
    try {
      names = await readdir(folder);
    } catch (error) {
      // Removed since `lstat` saw it: it isn't in the folder any more.
      if (isMissing(error)) return;
      throw error;
    }
    for (const name of names) {
      if (found.length > limit) return;
      const path = relative === undefined ? name : `${relative}/${name}`;
      const stats = await lstatOrNull(join(folder, name));
      // Gone since `readdir`: it isn't in the folder any more.
      if (stats === null) continue;
      found.push(entryOf(path, stats));
      if (stats.isDirectory()) await this.#walk(join(folder, name), path, found, limit);
    }
  }
}

/**
 * Whether there is a folder at `path`, following links on the way and at the
 * end: only for the root, which the person chose, never for what is under it.
 */
async function isFolderThroughLinks(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** The port's view of what `lstat` saw: only a file has a size, and a link is never a folder. */
function entryOf(path: string, stats: Stats): FolderEntry {
  if (stats.isFile()) return { path, kind: "file", size: stats.size };
  if (stats.isDirectory()) return { path, kind: "folder" };
  if (stats.isSymbolicLink()) return { path, kind: "link" };
  return { path, kind: "other" };
}

/** Whether two stats describe the same file: same device and inode. */
function sameFile(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

/** Plain code-unit order, as the port asks, never the locale's. Paths in one listing are never equal. */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : 1;
}
