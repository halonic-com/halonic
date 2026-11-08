/** Version of the {@link DefinitionStore} and {@link DefinitionSource} ports. A breaking change bumps it and comes with an ADR. */
export const definitionStoreVersion = 1;

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
   * gives `[]`.
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

/** A {@link DefinitionSource} that can also change the files: the Studio's editors and `halonic serve` use it. */
export interface DefinitionStore extends DefinitionSource {
  /** Creates or replaces a file, creating folders as needed. */
  write(path: string, content: string): Promise<void>;
  /** Deletes a file. Deleting a file that isn't there is not an error. */
  remove(path: string): Promise<void>;
}
