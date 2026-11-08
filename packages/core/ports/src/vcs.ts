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

/** Version control of one workspace folder (git today). Paths are relative to that folder. */
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
  /** Commits what is staged; returns the new commit hash. */
  commit(message: string): Promise<string>;
  /** At most `limit` (at least 1) commits that touch the folder, newest first. */
  log(limit: number): Promise<VcsCommit[]>;
  /** The local branch names. */
  branches(): Promise<string[]>;
  /** Switches to a local branch. */
  checkout(branch: string): Promise<void>;
  /** Creates a branch from the current commit and switches to it. */
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
