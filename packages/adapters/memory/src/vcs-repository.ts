import type { VcsChange } from "@halonicjs/ports";

/** Files by path: a commit's tree or the index. */
export type Tree = ReadonlyMap<string, string>;

/** One commit. Commits never change, so repositories and remotes share them. */
export interface Commit {
  hash: string;
  parent: string | null;
  tree: Tree;
  author: string;
  date: string;
  message: string;
}

/** A branch's upstream: a remote and the branch name there. */
export interface Upstream {
  remote: string;
  branch: string;
}

/** What `init` creates: the history, the branches and the index. The working tree is the files store. */
export interface Repository {
  commits: Map<string, Commit>;
  /** Branch name to its commit; `null` until the first commit on it. */
  branches: Map<string, string | null>;
  head: string;
  index: Map<string, string>;
  remotes: Map<string, MemoryRemote>;
  upstreams: Map<string, Upstream>;
  /** What each remote branch was at the last pull or push, by "origin/main". */
  tracking: Map<string, string>;
}

/** A remote that `MemoryVcs` repositories push to and pull from, like a bare repository. */
export class MemoryRemote {
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
}

/** A new repository on `branch`, with no commits yet. */
export function newRepository(branch: string): Repository {
  return {
    commits: new Map(),
    branches: new Map([[branch, null]]),
    head: branch,
    index: new Map(),
    remotes: new Map(),
    upstreams: new Map(),
    tracking: new Map(),
  };
}

/** The current branch's last commit; `null` before the first commit. */
export function headCommit(repo: Repository): string | null {
  return repo.branches.get(repo.head) ?? null;
}

/** What a remote branch, such as "origin/main", was at the last pull or push; `null` when never seen. */
export function trackedCommit(repo: Repository, remoteBranch: string): string | null {
  return repo.tracking.get(remoteBranch) ?? null;
}

/** The last commit's files on the current branch; none before the first commit. */
export function headTree(repo: Repository): Tree {
  return treeOf(repo.commits, headCommit(repo));
}

/** The remote of that name. */
export function remoteOf(repo: Repository, name: string): MemoryRemote {
  const remote = repo.remotes.get(name);
  if (remote === undefined) throw new Error(`There is no remote ${name}.`);
  return remote;
}

/** The changes from the last commit to the index. A deleted file whose content was added elsewhere is a rename. */
export function stagedChanges(head: Tree, index: Tree): VcsChange[] {
  const added: string[] = [];
  const deleted: string[] = [];
  const changes: VcsChange[] = [];
  for (const [path, content] of index) {
    const committed = head.get(path);
    if (committed === undefined) added.push(path);
    else if (committed !== content) changes.push({ path, status: "modified", staged: true });
  }
  for (const path of head.keys()) {
    if (!index.has(path)) deleted.push(path);
  }
  for (const path of added) {
    const from = deleted.find((old) => head.get(old) === index.get(path));
    if (from === undefined) {
      changes.push({ path, status: "added", staged: true });
    } else {
      deleted.splice(deleted.indexOf(from), 1);
      changes.push({ path, status: "renamed", staged: true, from });
    }
  }
  for (const path of deleted) changes.push({ path, status: "deleted", staged: true });
  return changes;
}

/** The changes from the index to the working tree, whose files are given by path. */
export function unstagedChanges(
  index: Tree,
  working: ReadonlyMap<string, string | null>,
): VcsChange[] {
  const changes: VcsChange[] = [];
  for (const [path, indexed] of index) {
    const content = working.get(path) ?? null;
    if (content === null) changes.push({ path, status: "deleted", staged: false });
    else if (content !== indexed) changes.push({ path, status: "modified", staged: false });
  }
  for (const path of working.keys()) {
    if (!index.has(path)) changes.push({ path, status: "untracked", staged: false });
  }
  return changes;
}

export function sameTree(a: Tree, b: Tree): boolean {
  return a.size === b.size && [...a].every(([path, content]) => b.get(path) === content);
}

export function commitOf(commits: ReadonlyMap<string, Commit>, hash: string): Commit {
  const commit = commits.get(hash);
  if (commit === undefined) throw new Error(`Missing commit ${hash}.`);
  return commit;
}

export function treeOf(commits: ReadonlyMap<string, Commit>, hash: string | null): Tree {
  return hash === null ? new Map() : commitOf(commits, hash).tree;
}

export function copyCommits(from: ReadonlyMap<string, Commit>, to: Map<string, Commit>): void {
  for (const [hash, commit] of from) {
    if (!to.has(hash)) to.set(hash, commit);
  }
}

/** The commits `from` and its parents. */
function history(commits: ReadonlyMap<string, Commit>, from: string | null): Set<string> {
  const seen = new Set<string>();
  for (let hash = from; hash !== null; hash = commitOf(commits, hash).parent) seen.add(hash);
  return seen;
}

/** Whether `ancestor` is `descendant` or one of its parents. No commit (`null`) is everyone's ancestor. */
export function isAncestor(
  commits: ReadonlyMap<string, Commit>,
  ancestor: string | null,
  descendant: string | null,
): boolean {
  return ancestor === null || history(commits, descendant).has(ancestor);
}

/** How many commits `from` has that `other` doesn't. */
export function countMissing(
  commits: ReadonlyMap<string, Commit>,
  from: string | null,
  other: string | null,
): number {
  const theirs = history(commits, other);
  return [...history(commits, from)].filter((hash) => !theirs.has(hash)).length;
}
