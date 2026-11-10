import {
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
} from "@halonicjs/ports";

/** What one path in a {@link MemoryFolderReader} holds. */
type MemoryEntry =
  | { kind: "file"; bytes: Uint8Array }
  | { kind: "folder" }
  | { kind: "link"; target: string }
  | { kind: "other" };

/**
 * A folder in memory, for tests and the browser demo. Tests build it with
 * `putFile`, `putFolder`, `putLink` and `putSpecial`, and change it while a
 * caller reads it with the same methods and `remove`. Links are kept with
 * their target but, as the port says, never followed.
 */
export class MemoryFolderReader implements FolderReader {
  readonly location: string;
  readonly #entries = new Map<string, MemoryEntry>();

  constructor(location = "memory:folder") {
    this.location = location;
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined) {
      this.#checkReachable(dir);
      if (this.#entries.get(dir)?.kind !== "folder") return [];
    }
    const prefix = dir === undefined ? "" : `${dir}/`;
    const recursive = options.recursive ?? true;
    const listed = [...this.#entries]
      .filter(([path]) => path.startsWith(prefix))
      .filter(([path]) => recursive || !path.slice(prefix.length).includes("/"))
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([path, entry]) => folderEntry(path, entry));
    return options.limit === undefined ? listed : listed.slice(0, options.limit + 1);
  }

  async read(path: string): Promise<Uint8Array | null> {
    this.#checkReachable(path);
    const entry = this.#entries.get(path);
    if (entry?.kind === "file") return entry.bytes.slice();
    if (entry === undefined || entry.kind === "folder") return null;
    // A link never gets here: `#checkReachable` refuses it first.
    throw new RangeError(`${JSON.stringify(path)} is a special file: the reader never opens one.`);
  }

  async locationOf(path?: string): Promise<string | null> {
    if (path === undefined) return this.location;
    this.#checkReachable(path);
    return this.#entries.has(path) ? `${this.location}/${path}` : null;
  }

  /** For tests: creates or replaces a file, creating the folders above it. */
  putFile(path: string, content: Uint8Array | string): void {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content.slice();
    this.#put(path, { kind: "file", bytes });
  }

  /** For tests: creates a folder and the folders above it. */
  putFolder(path: string): void {
    this.#put(path, { kind: "folder" });
  }

  /** For tests: creates a symbolic link to `target`, which is kept but never followed. */
  putLink(path: string, target: string): void {
    this.#put(path, { kind: "link", target });
  }

  /** For tests: creates a special file, such as a socket or a pipe. */
  putSpecial(path: string): void {
    this.#put(path, { kind: "other" });
  }

  /** For tests: removes an entry and everything under it, as if it were deleted while a caller reads. */
  remove(path: string): void {
    checkWorkspacePath(path);
    for (const existing of [...this.#entries.keys()]) {
      if (existing === path || existing.startsWith(`${path}/`)) this.#entries.delete(existing);
    }
  }

  #put(path: string, entry: MemoryEntry): void {
    checkWorkspacePath(path);
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      const folder = segments.slice(0, depth).join("/");
      const existing = this.#entries.get(folder);
      if (existing !== undefined && existing.kind !== "folder") {
        throw new Error(
          `Can't put ${JSON.stringify(path)}: ${JSON.stringify(folder)} isn't a folder.`,
        );
      }
      this.#entries.set(folder, { kind: "folder" });
    }
    this.remove(path);
    this.#entries.set(path, entry);
  }

  /** Refuses an unsafe path, and one whose entry or any folder above it is a link. */
  #checkReachable(path: string): void {
    checkWorkspacePath(path);
    const segments = path.split("/");
    for (let depth = 1; depth <= segments.length; depth++) {
      const prefix = segments.slice(0, depth).join("/");
      if (this.#entries.get(prefix)?.kind === "link") {
        throw new RangeError(
          `${JSON.stringify(path)} goes through the link ${JSON.stringify(prefix)}: the reader never follows one.`,
        );
      }
    }
  }
}

/** The port's view of an entry: only a file has a size. */
function folderEntry(path: string, entry: MemoryEntry): FolderEntry {
  if (entry.kind === "file") return { path, kind: "file", size: entry.bytes.length };
  return { path, kind: entry.kind };
}

/** Plain code-unit order, as the port asks, never the locale's. Paths are map keys, so never equal. */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : 1;
}
