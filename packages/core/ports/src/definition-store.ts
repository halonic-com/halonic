/** Version of the {@link DefinitionStore} and {@link DefinitionSource} ports. A breaking change bumps it and comes with an ADR. */
export const definitionStoreVersion = 2;

/**
 * Read access to the workspace files (agents, workflows, hubs …), wherever
 * they live: a folder, git, memory or a deployed snapshot. Paths are
 * relative and "/" separated.
 *
 * **Every method refuses an unsafe path** with a `RangeError` before it
 * touches storage: one that is absolute, has a `.`, `..` or empty segment, or
 * contains a backslash or NUL. The port says so, not each adapter, because
 * in the old repo only the Node adapter checked. Refusing `.` keeps `a/./b`
 * from meaning `a/b` in a folder but another key in a key-value store.
 *
 * **Every method also refuses a private entry** with a `RangeError`, and
 * `list()` leaves such entries out instead of throwing. A private entry is
 * a path with a segment that, after the clean-up below, is `.git`,
 * `.studio`, `.env` or `.envrc`, or starts with `.env.` (such as
 * `.env.local`). The clean-up matches segments the way Windows and macOS
 * would open them: it removes the code points HFS+ ignores (as git's
 * `is_hfs_dotgit` does, so `.g\u200Cit` is `.git`), ignores case and
 * removes trailing dots and spaces. Two more kinds of segment are private
 * whatever their name: one that holds a `:`, because NTFS opens
 * `.env::$DATA` as `.env`, and one that holds `~` followed by a digit,
 * because that is how 8.3 short names look (`GIT~1`, `ENV~1.LOC`,
 * `GI3F2A~1`), as git refuses for its own paths.
 *
 * **Any symbolic link** counts as private too, wherever it points, inside
 * the root or not, and so do Windows junctions and other reparse points. A
 * link in any segment counts, not only the last: a store that has links
 * refuses to read, write or remove through one and doesn't list it or
 * anything under it. This keeps the served Studio and agents away from git
 * internals, Halonic's own data and secrets files.
 *
 * A cloud deployment hands out only this read side, so a stolen session can't
 * change what runs.
 */
export interface DefinitionSource {
  /** Human-readable location, such as "~/workspaces/acme" or "memory:demo". */
  readonly location: string;
  /**
   * Lists the file paths under a directory, recursively and sorted. The
   * paths are relative to the store root, not to `dir`, as in the old
   * adapter. Omit `dir` for the whole store; `""` is an empty path and is
   * refused like any other unsafe path. A directory that doesn't exist
   * gives `[]`. A folder under the root that the account may not read
   * throws an `UnreadableWorkspaceFolderError` naming it, rather than being
   * left out.
   */
  list(dir?: string): Promise<string[]>;
  /** The file's text, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /**
   * Identifier of the current version of the definitions (git commit, content
   * hash). Runs record it so they can be explained and replayed later.
   */
  version(): Promise<string>;
}

/**
 * What a caller expects a file to hold before it writes: the digest of the
 * text it last read, or `"absent"` for a file that should not exist yet. The
 * digest is `sha256:` and the 64 lowercase hex characters of the SHA-256 of
 * the text's UTF-8 bytes: a fixed format, not one each store picks, so a
 * caller can work it out from text it got elsewhere (a proposal's snapshot)
 * and a watcher can recognise its own write. `contentDigest` and
 * `matchesExpected` in `@halonicjs/std` work it out and compare it, so every
 * store does both the same way.
 */
export type ExpectedContent = `sha256:${string}` | "absent";

/** Options for {@link DefinitionStore.write}. */
export interface WriteOptions {
  /**
   * Write only if the file still holds this (save model 1.7). Leave it out
   * to replace the file whatever it holds, as setting up a new workspace or
   * checking out a version does. The Studio's saves always pass it.
   */
  readonly expected?: ExpectedContent;
}

/**
 * What {@link DefinitionStore.write} did. `changed-on-disk` means the file
 * no longer held what the caller expected, so nothing was written; `current`
 * is its text now, or `null` when it is gone, so the Studio can show
 * Compare without reading it again.
 */
export type WriteResult =
  | { readonly status: "written" }
  | { readonly status: "changed-on-disk"; readonly current: string | null };

/**
 * One workspace file that changed outside Halonic. `removed` means it is gone
 * at the end of the batch; a file removed and created again, as many editors
 * save, is `changed`. A folder that went away gives one `removed` per file
 * that was in it.
 */
export interface WorkspaceFileChange {
  readonly path: string;
  readonly kind: "changed" | "removed";
}

/** Who hears about changes from outside Halonic while a watch is open. */
export interface DefinitionWatchListener {
  /**
   * One batch of changes, each path at most once, sorted by path. Many
   * changes close together (a checkout touching 50 files) come as one batch.
   */
  changed(changes: readonly WorkspaceFileChange[]): void;
  /** The watch broke (the folder went away, say) and reports nothing more. */
  failed(error: Error): void;
}

/** An open watch; see {@link DefinitionStore.watch}. */
export interface DefinitionWatch {
  /** Stops the watch. No batch is reported after it resolves. */
  close(): Promise<void>;
}

/** A {@link DefinitionSource} that can also change the files: the Studio's editors and `halonic serve` use it. */
export interface DefinitionStore extends DefinitionSource {
  /**
   * Creates or replaces a file, creating folders as needed. With
   * `expected`, it first checks the file still holds what the caller last
   * read and, if not, writes nothing and returns `changed-on-disk`.
   */
  write(path: string, content: string, options?: WriteOptions): Promise<WriteResult>;
  /** Deletes a file. Deleting a file that isn't there is not an error. */
  remove(path: string): Promise<void>;
  /**
   * Reports the files that change from outside Halonic (save model 6):
   * another editor, a sync tool, `git pull`. A change is one whose text
   * differs from what the store last saw, so the store's own writes and
   * removes, and a file saved again with the same text, are not reported.
   * Private entries are left out, as in `list()`. A store nothing else can
   * change, such as one in memory, reports nothing.
   */
  watch(listener: DefinitionWatchListener): Promise<DefinitionWatch>;
}

/**
 * What a {@link DefinitionSource}'s `list()` throws when the account may not
 * read a folder under the store's root (requirement
 * `ports.unreadable-workspace-folder`). Leaving the folder out instead would
 * hide the agents in it without a word, which is worse than an error.
 *
 * `path` is the folder's workspace path, so a caller can name it without
 * knowing where the store keeps its files. The message is for the log; keep
 * the store's own error in `cause`.
 *
 * Check for it with {@link isUnreadableWorkspaceFolderError}, not
 * `instanceof`: an adapter may be built against its own copy of this package.
 *
 * @example
 * throw new UnreadableWorkspaceFolderError("hubs/support", "The folder can't be read.", { cause });
 */
export class UnreadableWorkspaceFolderError extends Error {
  override readonly name = "UnreadableWorkspaceFolderError";
  /** The folder's workspace path: relative and "/" separated, as the port's paths are. */
  readonly path: string;

  /**
   * @param path - the folder's workspace path
   * @param message - for the log
   * @param options - `cause` keeps the error this one wraps
   */
  constructor(path: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.path = path;
  }
}

/**
 * Whether `value` is an {@link UnreadableWorkspaceFolderError}: an `Error`
 * named "UnreadableWorkspaceFolderError" with a `path`. It works across
 * copies of this package, where `instanceof` doesn't.
 *
 * @example
 * const folder = isUnreadableWorkspaceFolderError(error) ? error.path : null;
 */
export function isUnreadableWorkspaceFolderError(
  value: unknown,
): value is UnreadableWorkspaceFolderError {
  if (!(value instanceof Error) || value.name !== "UnreadableWorkspaceFolderError") return false;
  return typeof (value as { path?: unknown }).path === "string";
}

// The path rules above, as code, so every adapter refuses exactly the same paths.

/**
 * Refuses a workspace path the `DefinitionSource` port calls unsafe: one that
 * is absolute, has a `.`, `..` or empty segment, or contains a backslash or
 * NUL. Checked before the store is touched, so `a/./b` can never mean `a/b`.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkWorkspacePath(path: string): void {
  if (path.includes("\\") || path.includes("\u0000")) {
    throw new RangeError(`Unsafe workspace path ${JSON.stringify(path)}: no backslash or NUL.`);
  }
  if (path.startsWith("/")) {
    throw new RangeError(`Unsafe workspace path ${JSON.stringify(path)}: it must be relative.`);
  }
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new RangeError(
        `Unsafe workspace path ${JSON.stringify(path)}: no empty, "." or ".." segment.`,
      );
    }
  }
}

/**
 * Refuses an unsafe path, as {@link checkWorkspacePath} does, and also a
 * private one (see {@link isPrivateWorkspacePath}). Every method that takes a path
 * calls this.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkPublicWorkspacePath(path: string): void {
  checkWorkspacePath(path);
  if (isPrivateWorkspacePath(path)) {
    throw new RangeError(
      `Private workspace path ${JSON.stringify(path)}: the store doesn't serve it.`,
    );
  }
}

/** Code points HFS+ ignores in a name, as in git's `next_hfs_char`. */
const hfsIgnored = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/gu;

/**
 * Whether a safe path has a private segment, as the port defines it: after
 * removing the code points HFS+ ignores, ignoring case and removing trailing
 * dots and spaces, `.git`, `.studio`, `.env`, `.envrc` or `.env.` and more;
 * or, whatever its name, a segment with a `:` (an NTFS stream) or a `~`
 * followed by a digit (an 8.3 short name).
 */
export function isPrivateWorkspacePath(path: string): boolean {
  return path.split("/").some(isPrivateSegment);
}

/**
 * A path segment the way Windows and macOS would open it, as the private
 * rule above compares names: without the code points HFS+ ignores, with
 * case folded as any file system might fold it, and without trailing dots
 * and spaces. Another folder a store or decorator keeps to itself compares
 * names the same way, so `.Halonic./x` can't get round a check for
 * `.halonic/x`.
 *
 * @example
 * segmentAsOpened(".G\u200CIT. "); // ".git"
 */
export function segmentAsOpened(segment: string): string {
  return (
    segment
      .replace(hfsIgnored, "")
      // Upper case first, so letters that fold to ASCII on some file system match
      // too: a long s to `s`, an `st` ligature to `st`, a dotless i to `i`.
      .toUpperCase()
      .toLowerCase()
      .replace(/[. ]+$/u, "")
  );
}

function isPrivateSegment(segment: string): boolean {
  if (segment.includes(":") || /~\d/u.test(segment)) {
    return true;
  }
  const name = segmentAsOpened(segment);
  return (
    name === ".git" ||
    name === ".studio" ||
    name === ".env" ||
    name === ".envrc" ||
    name.startsWith(".env.")
  );
}
