/** Version of the {@link FolderReader} port. A breaking change bumps it and comes with an ADR. */
export const folderReaderVersion = 1;

/**
 * One entry under a {@link FolderReader}'s folder. `path` is relative to the
 * folder and "/" separated on every system. A `link` is a symbolic link, a
 * Windows junction or any other reparse point; `other` is anything that is
 * neither a file, a folder nor a link, such as a pipe, a socket or a device.
 * Only a file has a size: its length in bytes.
 *
 * @example
 * const entry: FolderEntry = { path: "acme-notes/plugin.yaml", kind: "file", size: 412 };
 */
export type FolderEntry =
  | { readonly path: string; readonly kind: "file"; readonly size: number }
  | { readonly path: string; readonly kind: "folder" | "link" | "other" };

/** Options for {@link FolderReader.entries}. */
export interface FolderEntriesOptions {
  /**
   * Stop listing once more than this many entries were found, so a huge
   * folder can't stall the caller. The result then holds `limit + 1`
   * entries, which tells the caller the folder went past it.
   */
  readonly limit?: number;
  /**
   * `false` lists only the entries directly under the folder, without going
   * into the folders among them, so a caller can find what a folder holds
   * without listing everything inside. `true` by default.
   */
  readonly recursive?: boolean;
}

/**
 * Read access to every byte of a folder, with nothing left out (requirement
 * `ports.folder-reader`). The plugin service reads a plugin folder through
 * it, because a plugin's trust fingerprint has to cover each file exactly as
 * the plugin's own code would find it.
 *
 * **Unlike `DefinitionSource`, it hides nothing.** `.git`, `.env` and
 * other names a workspace keeps private are listed and read like any other.
 * Links and special files are listed, with their kind, but never followed
 * and never read: a caller decides what to do about them. Bytes come back
 * as they are, so two files that differ only in bytes that aren't valid
 * UTF-8 never read the same.
 *
 * **Every method refuses an unsafe path** with a `RangeError` before it
 * touches storage, by the rule of `checkWorkspacePath`: one that is
 * absolute, has a `.`, `..` or empty segment, or holds a backslash or NUL.
 * A path whose entry or any folder above it is a link is refused the same
 * way, so nothing is ever read through a link.
 *
 * It only reads. Whoever hashes what it read hashes the bytes `read` gave,
 * never a second read, so what is trusted is what was hashed.
 *
 * @example
 * for (const entry of await reader.entries("acme-notes")) {
 *   const bytes = entry.kind === "file" ? await reader.read(entry.path) : null;
 *   if (bytes !== null) hashes.set(entry.path, await digest.sha256(bytes));
 * }
 */
export interface FolderReader {
  /** Human-readable location of the folder, such as "~/.halonic/plugins" or "memory:plugins". */
  readonly location: string;
  /**
   * Every entry under `dir`, recursively unless `options.recursive` is
   * `false`, links and special files included but never followed. Paths are relative to the reader's folder, not to
   * `dir`, and sorted by plain code-unit order (not by locale), so the
   * same folder lists the same on every system. Omit `dir` for the whole
   * folder; `""` is an empty path and is refused like any other unsafe
   * path. A `dir` that doesn't exist or is a file gives `[]`.
   */
  entries(dir?: string, options?: FolderEntriesOptions): Promise<FolderEntry[]>;
  /**
   * The file's bytes, a fresh copy on every call, or `null` when there is
   * no file at `path` (nothing, or a folder). Rejects with a `RangeError`
   * for a link or a special file, which it never opens.
   */
  read(path: string): Promise<Uint8Array | null>;
  /**
   * The resolved real location of an entry, such as its absolute path with
   * every link above the folder resolved, for a trust record's location.
   * Omit `path` for the folder itself. `null` when there is no entry at
   * `path`. Async, because a file system adapter has to ask the system.
   */
  locationOf(path?: string): Promise<string | null>;
}
