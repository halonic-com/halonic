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
  status: VcsFileStatus;
  /** In the index (will be committed) or only in the working tree. */
  staged: boolean;
  /** Renames: the old path. */
  from?: string;
}

/** The state of the workspace folder's repository. */
export interface VcsStatus {
  isRepo: boolean;
  /** Current branch; null when detached or not a repo. */
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: VcsChange[];
}

/** One commit in the history. */
export interface VcsCommit {
  hash: string;
  author: string;
  /** ISO date. */
  date: string;
  message: string;
}

/** Version control of one workspace folder (git today). Paths are relative to that folder. */
export interface Vcs {
  status(): Promise<VcsStatus>;
  /** Unified diff of one file: staged = index vs HEAD, otherwise working tree vs index. */
  diff(path: string, staged: boolean): Promise<string>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  /** Throw away working-tree changes: tracked files go back to the index, untracked files are deleted. */
  discard(paths: string[]): Promise<void>;
  /** Commits what is staged; returns the new commit hash. */
  commit(message: string): Promise<string>;
  log(limit: number): Promise<VcsCommit[]>;
  branches(): Promise<string[]>;
  checkout(branch: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  /** Make the folder a repository (and ignore the folder Halonic keeps its runtime data in). */
  init(): Promise<void>;
  remotes(): Promise<string[]>;
  pull(): Promise<void>;
  push(): Promise<void>;
}
