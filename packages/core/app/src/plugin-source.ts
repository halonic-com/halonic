// A plugin's source, read once, as `app.plugin-add` asks: adding a plugin
// checks and hashes the source through this reader, then places exactly
// the bytes it hashed, so what is trusted is what was checked even when the
// source changes while it is added (HAL-1736 plan, step 1).

import type { FolderEntriesOptions, FolderEntry, FolderReader } from "@halonicjs/ports";

/** The folder name the source is read under, before its plugin's id is known. */
export const sourceFolder = "source";

/**
 * Shows the source folder `source` as the one folder {@link sourceFolder},
 * so `readPluginFolder` reads it as it reads a plugin folder, and keeps the
 * bytes of every file it reads. A file is read from the source only once.
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
    const listed = await this.#source.entries(fromSource(dir), options);
    return listed.map((entry) => ({ ...entry, path: `${sourceFolder}/${entry.path}` }));
  }

  async read(path: string): Promise<Uint8Array | null> {
    const inSource = fromSource(path);
    if (inSource === undefined) return null;
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
