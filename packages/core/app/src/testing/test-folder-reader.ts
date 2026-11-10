// A profile's plugin folder in memory, for the plugin service's tests. Core
// can't use the memory adapter, so this is the smallest `FolderReader` the
// tests need: files, links and special files, a hook that removes or breaks
// a file while it is read, and the port's listing rules.

import type { FolderEntriesOptions, FolderEntry, FolderReader } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";

type Entry =
  | { kind: "file"; bytes: Uint8Array }
  | { kind: "folder" }
  | { kind: "link" }
  | { kind: "other" };

/** A folder of plugins in memory, at `/profile/plugins`. */
export class TestFolderReader implements FolderReader {
  readonly location = "/profile/plugins";
  readonly #entries = new Map<string, Entry>();
  /** Runs before a file is read, so a test can change the folder or throw. */
  beforeRead: (path: string) => void = () => {};

  /** Puts files, creating the folders above them. A string is its UTF-8 bytes. */
  putFiles(files: Readonly<Record<string, string | Uint8Array>>): this {
    for (const [path, content] of Object.entries(files)) {
      const bytes = typeof content === "string" ? encodeUtf8(content) : content;
      this.#put(path, { kind: "file", bytes });
    }
    return this;
  }

  putLink(path: string): this {
    this.#put(path, { kind: "link" });
    return this;
  }

  putSpecial(path: string): this {
    this.#put(path, { kind: "other" });
    return this;
  }

  /** Removes an entry and everything under it. */
  remove(path: string): void {
    for (const existing of [...this.#entries.keys()]) {
      if (existing === path || existing.startsWith(`${path}/`)) this.#entries.delete(existing);
    }
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined && this.#entries.get(dir)?.kind !== "folder") return [];
    const prefix = dir === undefined ? "" : `${dir}/`;
    const listed = [...this.#entries]
      .filter(([path]) => path.startsWith(prefix))
      .filter(([path]) => options.recursive !== false || !path.slice(prefix.length).includes("/"))
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(
        ([path, entry]): FolderEntry =>
          entry.kind === "file"
            ? { path, kind: "file", size: entry.bytes.length }
            : { path, kind: entry.kind },
      );
    return options.limit === undefined ? listed : listed.slice(0, options.limit + 1);
  }

  async read(path: string): Promise<Uint8Array | null> {
    this.beforeRead(path);
    const entry = this.#entries.get(path);
    if (entry === undefined || entry.kind === "folder") return null;
    if (entry.kind !== "file")
      throw new RangeError(`${path} is a ${entry.kind}: the reader never opens one.`);
    return entry.bytes.slice();
  }

  async locationOf(path?: string): Promise<string | null> {
    if (path === undefined) return this.location;
    return this.#entries.has(path) ? `${this.location}/${path}` : null;
  }

  #put(path: string, entry: Entry): void {
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      this.#entries.set(segments.slice(0, depth).join("/"), { kind: "folder" });
    }
    this.#entries.set(path, entry);
  }
}
