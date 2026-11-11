import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type Clock,
  checkPluginFiles,
  checkPluginId,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
  segmentAsOpened,
} from "@halonicjs/ports";
import { isMissing, lstatOrNull } from "./links.ts";
import { renameOver } from "./rename-over.ts";

/** Where {@link FileSystemPluginFolder} does its work, and what it shows people. */
export interface FileSystemPluginFolderOptions {
  /**
   * A folder beside the plugins folder, on the same disk, where a plugin is
   * written before it is moved in and where a removed one waits to be
   * deleted. Never inside the plugins folder, so nothing half done is ever
   * listed as a plugin. `<root>.staging` by default.
   */
  readonly staging?: string;
  /** Shown to people as where the plugins folder is; the root by default. */
  readonly location?: string;
  /**
   * The time now, for telling a leftover in the staging folder from work
   * under way; the system clock by default.
   */
  readonly clock?: Clock;
}

/**
 * How long a folder this writer left in the staging folder must have been
 * untouched before the first `place` deletes it: an hour, so a write another
 * process has under way is left alone.
 */
const STALE_STAGING_MS = 60 * 60 * 1000;

/**
 * The name of a folder this writer makes in the staging folder: a plugin
 * being written, `<id>.<uuid>`, or one waiting to be deleted,
 * `removed.<uuid>`. Anything else in the staging folder isn't ours to delete.
 */
const STAGED_NAME = /^.+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** An entry at the top of the plugins folder, seen with `lstat`. */
interface TopEntry {
  readonly name: string;
  readonly isFolder: boolean;
}

/**
 * The profile's plugins folder on this machine, as a `PluginFolderWriter`
 * (requirement `fs-node.plugin-folder`). A plugin is written into a fresh
 * folder in the staging folder and then renamed into place in one step; a
 * removed one is renamed out first and deleted after, so a reader never
 * lists half of one. Every entry is looked at with `lstat`, so a symbolic
 * link or a Windows junction is never followed: `place` never replaces one
 * and `remove` takes away the link itself.
 */
export class FileSystemPluginFolder implements PluginFolderWriter {
  readonly location: string;
  readonly #root: string;
  readonly #staging: string;
  readonly #clock: Clock;
  #stagingSwept = false;

  /**
   * @param root - the plugins folder; a relative one is resolved against the working directory
   */
  constructor(root: string, options: FileSystemPluginFolderOptions = {}) {
    this.#root = resolve(root);
    this.#staging = resolve(options.staging ?? `${this.#root}.staging`);
    this.location = options.location ?? root;
    this.#clock = options.clock ?? { now: () => new Date() };
  }

  async place(
    id: string,
    files: ReadonlyMap<string, Uint8Array>,
    options: PlacePluginOptions,
  ): Promise<PluginPlacement> {
    checkPluginFiles(id, files);
    await this.#sweepStagingOnce();
    await mkdir(this.#root, { recursive: true });
    const existing = await this.#topEntry(id);
    if (existing !== undefined && !(options.replace && existing.name === id && existing.isFolder)) {
      return "taken";
    }
    const written = await this.#writeStaged(id, files);
    const target = join(this.#root, id);
    if (existing === undefined) {
      await this.#moveIn(written, target);
      return "placed";
    }
    const old = await this.#moveOut(target);
    try {
      await this.#moveIn(written, target);
    } catch (error) {
      await renameOver(old, target);
      throw error;
    }
    await rm(old, { recursive: true, force: true });
    return "placed";
  }

  async remove(id: string): Promise<void> {
    checkPluginId(id);
    // On a disk that ignores case, `lstat("weather")` finds `Weather`, so look
    // for the exact name in the listing first.
    const names = await this.#topNames();
    if (!names.includes(id)) return;
    const target = join(this.#root, id);
    const stats = await lstatOrNull(target);
    if (stats === null) return;
    if (stats.isSymbolicLink()) {
      await removeLink(target);
    } else if (stats.isDirectory()) {
      const old = await this.#moveOut(target);
      // `rm` takes away a link inside without following it.
      await rm(old, { recursive: true, force: true });
    } else {
      await unlink(target);
    }
  }

  /**
   * Deletes what a crash left in the staging folder, once per writer: every
   * folder this writer names, such as `removed.<uuid>`, untouched for an
   * hour. A leftover is never listed as a plugin, so a failure here is
   * ignored and `place` goes on.
   */
  async #sweepStagingOnce(): Promise<void> {
    if (this.#stagingSwept) return;
    this.#stagingSwept = true;
    let names: string[];
    try {
      names = await readdir(this.#staging);
    } catch {
      return;
    }
    const staleBefore = this.#clock.now().getTime() - STALE_STAGING_MS;
    for (const name of names.filter((found) => STAGED_NAME.test(found))) {
      const path = join(this.#staging, name);
      try {
        const stats = await lstatOrNull(path);
        // A rename changes `ctime` and not `mtime`, so the later of the two is when it was last touched.
        if (stats === null || Math.max(stats.mtimeMs, stats.ctimeMs) >= staleBefore) continue;
        // `rm` takes away a link itself, never what it points to.
        await rm(path, { recursive: true, force: true });
      } catch {
        // Left for the next writer; it is never listed as a plugin.
      }
    }
  }

  /** The entry at the top whose name is `id` in any case, by `segmentAsOpened`, if there is one. */
  async #topEntry(id: string): Promise<TopEntry | undefined> {
    const wanted = segmentAsOpened(id);
    const name = (await this.#topNames()).find((entry) => segmentAsOpened(entry) === wanted);
    if (name === undefined) return undefined;
    const stats = await lstatOrNull(join(this.#root, name));
    return { name, isFolder: stats?.isDirectory() === true };
  }

  /** The names at the top of the plugins folder; none when it isn't there yet. */
  async #topNames(): Promise<string[]> {
    try {
      return await readdir(this.#root);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  /** Writes every file into a new folder in the staging folder; on failure, deletes it. */
  async #writeStaged(id: string, files: ReadonlyMap<string, Uint8Array>): Promise<string> {
    await mkdir(this.#staging, { recursive: true });
    const folder = join(this.#staging, `${id}.${randomUUID()}`);
    await mkdir(folder);
    try {
      for (const [path, bytes] of files) {
        const file = join(folder, ...path.split("/"));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes, { flag: "wx" });
      }
      return folder;
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }

  /** Moves a written folder into the plugins folder; on failure, deletes it. */
  async #moveIn(written: string, target: string): Promise<void> {
    try {
      await renameOver(written, target);
    } catch (error) {
      await rm(written, { recursive: true, force: true });
      throw error;
    }
  }

  /** Moves a plugin folder out of the plugins folder, so it is gone at once, and gives where it went. */
  async #moveOut(target: string): Promise<string> {
    await mkdir(this.#staging, { recursive: true });
    const old = join(this.#staging, `removed.${randomUUID()}`);
    await renameOver(target, old);
    return old;
  }
}

/**
 * Removes a symbolic link or a Windows junction itself. `unlink` does it for
 * both on most systems; Windows refuses `unlink` on a folder link, and
 * `rmdir` there takes away the link without going into what it points to.
 */
async function removeLink(link: string): Promise<void> {
  try {
    await unlink(link);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (process.platform !== "win32" || (code !== "EPERM" && code !== "EISDIR")) throw error;
    await rmdir(link);
  }
}
