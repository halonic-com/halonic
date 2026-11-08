/** Version of the {@link Vcs} port. A breaking change bumps it and comes with an ADR. */
export const vcsVersion = 1;

/** How a file differs from the last commit. */
export type VcsFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

/** One changed file. */
export interface VcsChange {
  /** Path relative to the workspace root, "/" separated. */
  path: string;
  /** How it differs from the last commit. */
  status: VcsFileStatus;
  /** In the index (will be committed) or only in the working tree. */
  staged: boolean;
  /** Renames: the old path. */
  from?: string;
}

/** The state of the workspace folder's repository. */
export interface VcsStatus {
  /** Whether the folder is a repository at all; when not, the other fields are empty. */
  isRepo: boolean;
  /** Current branch; null when detached or not a repo. */
  branch: string | null;
  /** The branch it tracks, such as "origin/main", or `null` when none. */
  upstream: string | null;
  /** Commits on the branch that the upstream doesn't have. */
  ahead: number;
  /** Commits on the upstream that the branch doesn't have. */
  behind: number;
  /** Every changed file, staged or not. */
  changes: VcsChange[];
}

/** One commit in the history. */
export interface VcsCommit {
  /** The full commit hash. */
  hash: string;
  /** The author's name. */
  author: string;
  /** ISO date. */
  date: string;
  /** The first line of the commit message. */
  message: string;
}

/**
 * Version control of one workspace folder (git today). Paths are relative to that folder.
 *
 * **Nothing a caller passes is ever read as an option or as the
 * repository's own files.** The old desktop app kept a blocklist of git
 * options, which a unique prefix such as `--upload-pac=` could get around.
 * So every adapter, before anything runs:
 *
 * - refuses with a `RangeError` an **unsafe path**: one the
 *   `DefinitionSource` port refuses (absolute, a `.`, `..` or empty segment,
 *   a backslash or NUL), and one with a segment that is `.git` in any case,
 *   or that a file system reads as `.git` (with trailing dots or spaces, or
 *   the short name `git~1`);
 * - treats a path that starts with `-` as a file name, never an option;
 * - refuses with a `RangeError` a **branch name** that starts with `-` or
 *   that `git check-ref-format --branch` refuses, and the name `HEAD`;
 * - commits a message as the message, whatever it starts with.
 *
 * Remotes and upstreams come from the repository, never from a caller.
 */
export interface Vcs {
  /** The branch, its upstream and the changed files. */
  status(): Promise<VcsStatus>;
  /** Unified diff of one file: staged = index vs HEAD, otherwise working tree vs index. Empty when they are the same. */
  diff(path: string, staged: boolean): Promise<string>;
  /** Adds the files' changes to the index. */
  stage(paths: string[]): Promise<void>;
  /** Takes the files' changes out of the index, leaving the working tree as it is. */
  unstage(paths: string[]): Promise<void>;
  /** Throw away working-tree changes: tracked files go back to the index, untracked files are deleted. */
  discard(paths: string[]): Promise<void>;
  /**
   * Commits what is staged; returns the new commit hash.
   *
   * @throws when nothing is staged
   */
  commit(message: string): Promise<string>;
  /**
   * At most `limit` commits that touch the folder, newest first.
   *
   * @throws RangeError when `limit` isn't a whole number of at least 1
   */
  log(limit: number): Promise<VcsCommit[]>;
  /** The local branch names. */
  branches(): Promise<string[]>;
  /**
   * Switches to a local branch.
   *
   * @throws when there is no such branch
   */
  checkout(branch: string): Promise<void>;
  /**
   * Creates a branch from the current commit and switches to it.
   *
   * @throws when a branch of that name already exists
   */
  createBranch(name: string): Promise<void>;
  /** Make the folder a repository (and ignore the folder Halonic keeps its runtime data in). */
  init(): Promise<void>;
  /** The remote names, such as "origin". */
  remotes(): Promise<string[]>;
  /**
   * Brings in the upstream's commits, fast-forward only.
   *
   * @throws when the branch and its upstream have both moved on; nothing is merged
   */
  pull(): Promise<void>;
  /**
   * Sends the branch's commits to its upstream, or to the first remote (which
   * becomes the upstream) when it has none.
   *
   * @throws when the remote has commits the branch doesn't (no force push), or there is no remote
   */
  push(): Promise<void>;
}
