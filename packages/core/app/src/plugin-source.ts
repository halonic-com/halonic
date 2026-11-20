// A plugin's source, read once, as `app.plugin-add` asks: adding a plugin
// checks and hashes the source through this reader, then places exactly
// the bytes it hashed, so what is trusted is what was checked even when the
// source changes while it is added (HAL-1736 plan, step 1).

import {
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
  isDeniedHomePath,
  isPrivateWorkspacePath,
  segmentAsOpened,
} from "@halonicjs/ports";
import { absolutePathsOverlap } from "@halonicjs/std";

/** The folder name the source is read under, before its plugin's id is known. */
export const sourceFolder = "source";

/**
 * Shows the source folder `source` as the one folder {@link sourceFolder},
 * so `readPluginFolder` reads it as it reads a plugin folder, and keeps the
 * bytes of every file it reads. A file is read from the source only once.
 *
 * A private name at any depth (`.git`, `.studio`, `.env*`, see
 * `isPrivateWorkspacePath`) isn't there: it isn't listed, and reads as no
 * file, so a plugin author's secrets never reach the plugins folder. Nor is
 * a path the sandbox denies in a home folder, at any depth and for every
 * system (`.ssh`, `.aws`, `.npmrc`, see `isDeniedHomePath`), so a copy
 * never hands a plugin what the sandbox keeps from it; those are noted, for
 * {@link PluginSourceSnapshot.deniedLeftOut}. The CLI and the Studio both
 * add through this, so they leave out the same names.
 */
export class PluginSourceSnapshot implements FolderReader {
  readonly #source: FolderReader;
  /** Every file's bytes as first read, by path from the source folder. */
  readonly #read = new Map<string, Uint8Array>();
  /** The denied home paths found and left out, by path from the source folder. */
  readonly #deniedLeftOut = new Set<string>();

  constructor(source: FolderReader) {
    this.#source = source;
  }

  get location(): string {
    return this.#source.location;
  }

  async entries(dir?: string, options?: FolderEntriesOptions): Promise<FolderEntry[]> {
    if (dir === undefined) {
      return [{ path: sourceFolder, kind: "folder" }];
    }
    const inSource = fromSource(dir);
    if (inSource !== undefined && isLeftOut(inSource)) return [];
    // Folder by folder, leaving private entries out before going into them,
    // so a `.git` is never walked and only kept entries count against
    // `limit`: `limit + 1` entries still means the source went past it.
    const limit = options?.limit;
    const found: FolderEntry[] = [];
    const pending = [inSource];
    while (pending.length > 0 && (limit === undefined || found.length <= limit)) {
      const folder = pending.pop();
      const room = limit === undefined ? undefined : limit + 1 - found.length;
      for (const entry of await this.#publicEntries(folder, room)) {
        if (options?.recursive !== false && entry.kind === "folder") pending.push(entry.path);
        found.push(entry);
      }
    }
    found.sort((left, right) => (left.path < right.path ? -1 : 1));
    return found
      .slice(0, limit === undefined ? undefined : limit + 1)
      .map((entry) => ({ ...entry, path: `${sourceFolder}/${entry.path}` }));
  }

  /**
   * The public entries directly under `folder`, at least `room` of them
   * when there are that many: the source is asked again with more room
   * while private entries took some of it.
   */
  async #publicEntries(
    folder: string | undefined,
    room: number | undefined,
  ): Promise<FolderEntry[]> {
    let asked = room;
    for (;;) {
      const listed = await this.#source.entries(folder, {
        recursive: false,
        ...(asked === undefined ? {} : { limit: asked }),
      });
      const kept = listed.filter((entry) => !this.#leaveOut(entry.path));
      if (asked === undefined || room === undefined) return kept;
      if (listed.length <= asked || kept.length >= room) return kept;
      asked += listed.length - kept.length;
    }
  }

  async read(path: string): Promise<Uint8Array | null> {
    const inSource = fromSource(path);
    if (inSource === undefined || isLeftOut(inSource)) return null;
    const kept = this.#read.get(inSource);
    if (kept !== undefined) return kept.slice();
    const bytes = await this.#source.read(inSource);
    if (bytes !== null) this.#read.set(inSource, bytes.slice());
    return bytes;
  }

  async locationOf(path?: string): Promise<string | null> {
    if (path === undefined) return await this.#source.locationOf();
    return await this.#source.locationOf(fromSource(path));
  }

  /**
   * Whether the entry at `path` is left out, noting it when it is a denied
   * home path. A private name is left out without a note, as it always was.
   */
  #leaveOut(path: string): boolean {
    if (isPrivateWorkspacePath(path)) return true;
    if (!isDeniedHomePath(path)) return false;
    this.#deniedLeftOut.add(path);
    return true;
  }

  /**
   * The denied home paths listed so far and left out, by path from the
   * source folder and sorted: `.ssh` for a whole folder, never what is in it.
   */
  deniedLeftOut(): string[] {
    return [...this.#deniedLeftOut].sort();
  }

  /** The bytes of every file read so far, by path from the source folder: what is placed. */
  files(): ReadonlyMap<string, Uint8Array> {
    return new Map(this.#read);
  }
}

/** Whether a path from the source folder is one a plugin's copy never has. */
function isLeftOut(path: string): boolean {
  return isPrivateWorkspacePath(path) || isDeniedHomePath(path);
}

/**
 * Whether a plugin's source at the real path `source` overlaps Halonic's own
 * data: it is, holds or is inside one of `halonicData` (such as the profile
 * folder, as written and with links resolved), or it is or is inside any
 * workspace's `.studio` data. A copy of it would hand a plugin what the
 * sandbox keeps from it, so `PluginService.add` refuses it.
 *
 * Paths are compared as Windows reads them, on every system (see
 * `absolutePathsOverlap`).
 *
 * @example
 * overlapsHalonicData("/person", ["/person/.halonic"]); // true: it holds the profile
 * overlapsHalonicData("/person/work/.studio/x", []); // true: inside a workspace's data
 * overlapsHalonicData("/person/plugins/weather", ["/person/.halonic"]); // false
 */
export function overlapsHalonicData(source: string, halonicData: readonly string[]): boolean {
  const inWorkspaceData = source
    .split(/[\\/]/u)
    .some((name) => segmentAsOpened(name) === ".studio");
  return inWorkspaceData || halonicData.some((data) => absolutePathsOverlap(source, data));
}

/**
 * `path` in the source folder: `undefined` for {@link sourceFolder} itself,
 * `backend/index.js` for `source/backend/index.js`.
 *
 * @throws a `RangeError` for a path outside {@link sourceFolder}
 */
function fromSource(path: string): string | undefined {
  if (path === sourceFolder) return undefined;
  if (!path.startsWith(`${sourceFolder}/`)) {
    throw new RangeError(`${JSON.stringify(path)} isn't in the plugin's source.`);
  }
  return path.slice(sourceFolder.length + 1);
}
