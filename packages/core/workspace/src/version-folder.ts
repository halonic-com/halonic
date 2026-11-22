// The workspace's folder as one version holds it, read like a folder on disk
// (HAL-16335): what a trust check hashes a local integration from, so the
// code a person trusts is the code at the commit a run starts from, not the
// saved files.

import {
  checkCommitId,
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { VersionReader } from "./version-source.ts";

/**
 * A {@link FolderReader} over one commit (requirement
 * `workspace.version-folder`). It lists and reads only through
 * `Vcs.listAt` and `Vcs.readAt` at that commit, never the files on disk.
 *
 * **It holds what a run's copy of the commit holds,** so unlike other
 * folder readers it hides the entries a workspace keeps private: it
 * leaves them out with `isPrivateWorkspacePath`, the rule the copy is
 * checked out by, so the two never disagree about which files are there.
 * A commit holds only files, so it lists no link or special file; the
 * folders above each file are listed as folders.
 *
 * A file's bytes are its committed text as UTF-8, so a file that isn't
 * valid UTF-8 reads differently from the copy on disk, and a hash of it
 * matches no trust of the real bytes: that fails closed.
 *
 * @example
 * const folder = new VersionFolder(vcs, commit, "~/workspaces/acme");
 * await readLocalIntegrations(folder, digest); // the integrations as committed
 */
export class VersionFolder implements FolderReader {
  readonly location: string;
  readonly #vcs: VersionReader;
  readonly #commit: string;

  /**
   * @param vcs - the workspace's version control
   * @param commit - the full id of the commit to read
   * @param location - where the workspace lives, as its saved store says
   * @throws RangeError for a commit that isn't a full commit id
   */
  constructor(vcs: VersionReader, commit: string, location: string) {
    checkCommitId(commit);
    this.#vcs = vcs;
    this.#commit = commit;
    this.location = location;
  }

  /** Every entry under `dir` in the version, as the port says; `[]` when it has none there. */
  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined) checkWorkspacePath(dir);
    const kinds = kindsUnder(dir, await this.#files(dir), options.recursive ?? true);
    const paths = [...kinds.keys()].sort(compareText);
    const shown = options.limit === undefined ? paths : paths.slice(0, options.limit + 1);
    const entries: FolderEntry[] = [];
    for (const path of shown) {
      entries.push(kinds.get(path) === "file" ? await this.#fileEntry(path) : folderEntry(path));
    }
    return entries;
  }

  /** The file's committed text as UTF-8 bytes, or `null` when the version has no file there. */
  async read(path: string): Promise<Uint8Array | null> {
    checkWorkspacePath(path);
    if (isPrivateWorkspacePath(path)) return null;
    const text = await this.#vcs.readAt(this.#commit, path);
    return text === null ? null : encodeUtf8(text);
  }

  /** `location`, with `path` after it, or `null` when the version has no entry at `path`. */
  async locationOf(path?: string): Promise<string | null> {
    if (path === undefined) return this.location;
    checkWorkspacePath(path);
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined;
    const found = (await this.entries(parent, { recursive: false })).some(
      (entry) => entry.path === path,
    );
    return found ? `${this.location}/${path}` : null;
  }

  /**
   * Every file under `dir` in the version, private entries left out. The
   * port's `listAt` already leaves them out; checking again here keeps this
   * reader to the copy's rule whatever version control it is given.
   */
  async #files(dir: string | undefined): Promise<string[]> {
    if (dir !== undefined && isPrivateWorkspacePath(dir)) return [];
    const listed = (await this.#vcs.listAt(this.#commit, dir)) ?? [];
    return listed.filter((path) => !isPrivateWorkspacePath(path));
  }

  /** A file's entry, with the size of the bytes {@link read} gives. */
  async #fileEntry(path: string): Promise<FolderEntry> {
    const bytes = await this.read(path);
    return { path, kind: "file", size: bytes?.byteLength ?? 0 };
  }
}

/**
 * The kind of each entry under `dir` that holds `files`: each file, and
 * each folder above one. Not `recursive`, only those directly in `dir`.
 */
function kindsUnder(
  dir: string | undefined,
  files: readonly string[],
  recursive: boolean,
): Map<string, "file" | "folder"> {
  const prefix = dir === undefined ? "" : `${dir}/`;
  const kinds = new Map<string, "file" | "folder">();
  for (const path of files) {
    const parts = path.slice(prefix.length).split("/");
    const folders = recursive ? parts.length - 1 : Math.min(parts.length - 1, 1);
    for (let depth = 1; depth <= folders; depth += 1) {
      kinds.set(prefix + parts.slice(0, depth).join("/"), "folder");
    }
    if (recursive || parts.length === 1) kinds.set(path, "file");
  }
  return kinds;
}

function folderEntry(path: string): FolderEntry {
  return { path, kind: "folder" };
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
