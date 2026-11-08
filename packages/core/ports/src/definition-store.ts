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
