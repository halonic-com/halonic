// A plugin's source, read once, as `app.plugin-add` asks: adding a plugin
// checks and hashes the source through this reader, then places exactly
// the bytes it hashed, so what is trusted is what was checked even when the
// source changes while it is added (HAL-1736 plan, step 1).

import {
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";

/** The folder name the source is read under, before its plugin's id is known. */
export const sourceFolder = "source";

/**
 * Shows the source folder `source` as the one folder {@link sourceFolder},
 * so `readPluginFolder` reads it as it reads a plugin folder, and keeps the
 * bytes of every file it reads. A file is read from the source only once.
 *
 * A private name at any depth (`.git`, `.studio`, `.env*`, see
 * `isPrivateWorkspacePath`) isn't there: it isn't listed, and reads as no
 * file, so a plugin author's secrets never reach the plugins folder. The CLI
 * and the Studio both add through this, so they leave out the same names.
 */
export class PluginSourceSnapshot implements FolderReader {
  readonly #source: FolderReader;
  /** Every file's bytes as first read, by path from the source folder. */
  readonly #read = new Map<string, Uint8Array>();

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
    if (inSource !== undefined && isPrivateWorkspacePath(inSource)) return [];
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
      const kept = listed.filter((entry) => !isPrivateWorkspacePath(entry.path));
      if (asked === undefined || room === undefined) return kept;
      if (listed.length <= asked || kept.length >= room) return kept;
      asked += listed.length - kept.length;
    }
  }

  async read(path: string): Promise<Uint8Array | null> {
    const inSource = fromSource(path);
    if (inSource === undefined || isPrivateWorkspacePath(inSource)) return null;
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

  /** The bytes of every file read so far, by path from the source folder: what is placed. */
  files(): ReadonlyMap<string, Uint8Array> {
    return new Map(this.#read);
  }
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
