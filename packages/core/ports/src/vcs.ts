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
 * The folder is a repository only when it is a repository's root. A folder
 * inside another repository is not one: its status says so, and `init`
 * makes it a repository of its own. So no method ever reads or changes a
 * file outside the folder, such as a parent repository's staged changes or
 * the files a checkout there would rewrite.
 */
export interface Vcs {
  /** The branch, its upstream and the changed files. */
  status(): Promise<VcsStatus>;
  /** Unified diff of one file: staged = index vs HEAD, otherwise working tree vs index. */
  diff(path: string, staged: boolean): Promise<string>;
  /** Adds the files' changes to the index. */
  stage(paths: string[]): Promise<void>;
  /** Takes the files' changes out of the index, leaving the working tree as it is. */
  unstage(paths: string[]): Promise<void>;
  /** Throw away working-tree changes: tracked files go back to the index, untracked files are deleted. */
  discard(paths: string[]): Promise<void>;
  /** Commits what is staged; returns the new commit hash. Refuses an empty message and an empty commit. */
  commit(message: string): Promise<string>;
  /** At most `limit` (at least 1) commits on the current branch, newest first. */
  log(limit: number): Promise<VcsCommit[]>;
  /** The local branch names; a branch with no commits yet isn't listed. */
  branches(): Promise<string[]>;
  /**
   * Switches to a local branch. Refuses, and changes nothing, when that would
   * overwrite an untracked file, or while a tracked file has changes: an
   * adapter may refuse any such change, as the memory one does, though git
   * refuses only those the branch would touch.
   */
  checkout(branch: string): Promise<void>;
  /** Creates a branch from the current commit and switches to it. Refuses `x/y` next to `x`, as git does. */
  createBranch(name: string): Promise<void>;
  /** Make the folder a repository, ignoring `.studio`, the folder Halonic keeps its runtime data in. */
  init(): Promise<void>;
  /** The remote names, such as "origin". */
  remotes(): Promise<string[]>;
  /**
   * Brings in the upstream's commits, fast-forward only. Like `checkout`, it
   * refuses to overwrite an untracked file or to switch over changes.
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
