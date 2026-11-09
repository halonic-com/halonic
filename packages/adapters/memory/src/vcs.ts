import type {
  Clock,
  DefinitionStore,
  Vcs,
  VcsChange,
  VcsCommit,
  VcsStatus,
} from "@halonicjs/ports";
import { ManualClock } from "./clock.ts";
import { unifiedDiff } from "./line-diff.ts";
import { sha256Hex } from "./sha256.ts";
import {
  clashingBranch,
  commitOf,
  copyCommits,
  countMissing,
  headCommit,
  headTree,
  isAncestor,
  type MemoryRemote,
  newRepository,
  type Repository,
  remoteOf,
  sameTree,
  stagedChanges,
  switchProblem,
  type Tree,
  trackedCommit,
  treeOf,
  unstagedChanges,
} from "./vcs-repository.ts";

export interface MemoryVcsOptions {
  /** Where commit dates come from. A new {@link ManualClock} by default. */
  clock?: Clock;
  /** The author of every commit. */
  author?: string;
}

/**
 * Version control in memory, over any {@link DefinitionStore} as the working
 * tree: for tests and the browser demo. It models what the `Vcs` port
 * promises: branches, an index, and fast-forward pulls and pushes without
 * force. It keeps no runtime folder, so `init` ignores nothing.
 */
export class MemoryVcs implements Vcs {
  readonly #files: DefinitionStore;
  readonly #clock: Clock;
  readonly #author: string;
  #repo: Repository | null = null;

  /** @param files - the working tree; the folder is not a repository until `init` */
  constructor(files: DefinitionStore, options: MemoryVcsOptions = {}) {
    this.#files = files;
    this.#clock = options.clock ?? new ManualClock();
    this.#author = options.author ?? "Memory Author";
  }

  /**
   * A new repository holding a clone of `remote`'s `branch`, which tracks
   * it. The branch's files are written to `files`, which should be empty.
   */
  static async clone(
    remote: MemoryRemote,
    files: DefinitionStore,
    {
      remoteName = "origin",
      branch = "main",
      ...options
    }: MemoryVcsOptions & {
      remoteName?: string;
      branch?: string;
    } = {},
  ): Promise<MemoryVcs> {
    const hash = remote.branches.get(branch);
    if (hash === undefined) throw new Error(`The remote has no branch ${branch}.`);
    const vcs = new MemoryVcs(files, options);
    const repo = vcs.#initialized(branch);
    copyCommits(remote.commits, repo.commits);
    repo.remotes.set(remoteName, remote);
    repo.branches.set(branch, hash);
    repo.upstreams.set(branch, { remote: remoteName, branch });
    repo.tracking.set(`${remoteName}/${branch}`, hash);
    await vcs.#switchTree(new Map(), treeOf(repo.commits, hash));
    return vcs;
  }

  /** Adds a remote. Not part of the port: a workspace's remotes come from its repository. */
  addRemote(name: string, remote: MemoryRemote): void {
    this.#requireRepo().remotes.set(name, remote);
  }

  async status(): Promise<VcsStatus> {
    const repo = this.#repo;
    if (repo === null) {
      return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, changes: [] };
    }
    const upstream = repo.upstreams.get(repo.head);
    const upstreamName = upstream === undefined ? null : `${upstream.remote}/${upstream.branch}`;
    const local = headCommit(repo);
    const remote = upstreamName === null ? null : trackedCommit(repo, upstreamName);
    return {
      isRepo: true,
      branch: repo.head,
      upstream: upstreamName,
      ahead: upstreamName === null ? 0 : countMissing(repo.commits, local, remote),
      behind: upstreamName === null ? 0 : countMissing(repo.commits, remote, local),
      changes: [...stagedChanges(headTree(repo), repo.index), ...(await this.#unstaged(repo))],
    };
  }

  async diff(path: string, staged: boolean): Promise<string> {
    const repo = this.#requireRepo();
    const indexed = repo.index.get(path) ?? null;
    if (staged) return unifiedDiff(path, headTree(repo).get(path) ?? null, indexed);
    // Like `git diff`, an untracked file has no working-tree diff.
    if (indexed === null) return "";
    return unifiedDiff(path, indexed, await this.#files.read(path));
  }

  async stage(paths: string[]): Promise<void> {
    const repo = this.#requireRepo();
    const contents = await this.#readAll(paths);
    for (const [path, content] of contents) {
      if (content === null && !repo.index.has(path)) {
        throw new Error(`Nothing to stage at ${JSON.stringify(path)}.`);
      }
    }
    for (const [path, content] of contents) {
      if (content === null) repo.index.delete(path);
      else repo.index.set(path, content);
    }
  }

  async unstage(paths: string[]): Promise<void> {
    const repo = this.#requireRepo();
    const head = headTree(repo);
    for (const path of paths) {
      const committed = head.get(path);
      if (committed === undefined) repo.index.delete(path);
      else repo.index.set(path, committed);
    }
  }

  async discard(paths: string[]): Promise<void> {
    const repo = this.#requireRepo();
    for (const path of paths) {
      const indexed = repo.index.get(path);
      if (indexed === undefined) await this.#files.remove(path);
      else await this.#files.write(path, indexed);
    }
  }

  async commit(message: string): Promise<string> {
    const repo = this.#requireRepo();
    // Like git, which aborts on an empty message.
    if (message.trim() === "") throw new Error("The commit message is empty.");
    const parent = headCommit(repo);
    if (sameTree(headTree(repo), repo.index)) throw new Error("Nothing is staged.");
    const tree: Tree = new Map(repo.index);
    const date = this.#clock.now().toISOString();
    const hash = (
      await sha256Hex(JSON.stringify([parent, [...tree], this.#author, date, message]))
    ).slice(0, 40);
    repo.commits.set(hash, { hash, parent, tree, author: this.#author, date, message });
    repo.branches.set(repo.head, hash);
    return hash;
  }

  async log(limit: number): Promise<VcsCommit[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`The log limit must be a whole number of at least 1, not ${limit}.`);
    }
    const repo = this.#requireRepo();
    const out: VcsCommit[] = [];
    let hash = headCommit(repo);
    while (hash !== null && out.length < limit) {
      const commit = commitOf(repo.commits, hash);
      // The first line only, as `git log --format=%s` gives it.
      const message = commit.message.replace(/\n[\s\S]*$/u, "");
      out.push({ hash, author: commit.author, date: commit.date, message });
      hash = commit.parent;
    }
    return out;
  }

  async branches(): Promise<string[]> {
    // Like `git branch`, a branch with no commits yet isn't listed.
    return [...this.#requireRepo().branches].flatMap(([name, hash]) =>
      hash === null ? [] : [name],
    );
  }

  async checkout(branch: string): Promise<void> {
    const repo = this.#requireRepo();
    const target = repo.branches.get(branch);
    if (target === undefined) throw new Error(`There is no branch ${branch}.`);
    await this.#requireClean(repo, treeOf(repo.commits, target));
    await this.#switchTree(headTree(repo), treeOf(repo.commits, target));
    repo.head = branch;
  }

  async createBranch(name: string): Promise<void> {
    const repo = this.#requireRepo();
    if (repo.branches.has(name)) throw new Error(`The branch ${name} already exists.`);
    const other = clashingBranch(repo.branches.keys(), name);
    if (other !== undefined)
      throw new Error(`The branch ${name} clashes with the branch ${other}.`);
    repo.branches.set(name, headCommit(repo));
    repo.head = name;
  }

  async init(): Promise<void> {
    if (this.#repo === null) this.#initialized("main");
  }

  async remotes(): Promise<string[]> {
    return [...this.#requireRepo().remotes.keys()];
  }

  async pull(): Promise<void> {
    const repo = this.#requireRepo();
    const upstream = repo.upstreams.get(repo.head);
    if (upstream === undefined) throw new Error(`The branch ${repo.head} has no upstream.`);
    const remote = remoteOf(repo, upstream.remote);
    const theirs = remote.branches.get(upstream.branch);
    if (theirs === undefined) throw new Error(`The remote has no branch ${upstream.branch}.`);
    copyCommits(remote.commits, repo.commits);
    repo.tracking.set(`${upstream.remote}/${upstream.branch}`, theirs);

    const ours = headCommit(repo);
    if (isAncestor(repo.commits, theirs, ours)) return;
    if (!isAncestor(repo.commits, ours, theirs)) {
      throw new Error("The branch and its upstream have both moved on; nothing was merged.");
    }
    await this.#requireClean(repo, treeOf(repo.commits, theirs));
    await this.#switchTree(headTree(repo), treeOf(repo.commits, theirs));
    repo.branches.set(repo.head, theirs);
  }

  async push(): Promise<void> {
    const repo = this.#requireRepo();
    const ours = headCommit(repo);
    if (ours === null) throw new Error(`The branch ${repo.head} has no commits to push.`);
    const [firstRemote] = repo.remotes.keys();
    const upstream =
      repo.upstreams.get(repo.head) ??
      (firstRemote === undefined ? undefined : { remote: firstRemote, branch: repo.head });
    if (upstream === undefined) throw new Error("There is no remote to push to.");
    const remote = remoteOf(repo, upstream.remote);
    const theirs = remote.branches.get(upstream.branch) ?? null;
    if (!isAncestor(repo.commits, theirs, ours)) {
      throw new Error("The remote has commits the branch doesn't; pull first.");
    }
    copyCommits(repo.commits, remote.commits);
    remote.branches.set(upstream.branch, ours);
    repo.upstreams.set(repo.head, upstream);
    repo.tracking.set(`${upstream.remote}/${upstream.branch}`, ours);
  }

  #initialized(branch: string): Repository {
    this.#repo = newRepository(branch);
    return this.#repo;
  }

  #requireRepo(): Repository {
    if (this.#repo === null) throw new Error("The folder is not a repository.");
    return this.#repo;
  }

  async #readAll(paths: string[]): Promise<Map<string, string | null>> {
    const contents = new Map<string, string | null>();
    for (const path of paths) contents.set(path, await this.#files.read(path));
    return contents;
  }

  async #unstaged(repo: Repository): Promise<VcsChange[]> {
    return unstagedChanges(repo.index, await this.#readAll(await this.#files.list()));
  }

  /** Refuses to switch to the tree `to` over changes it would lose; see {@link switchProblem}. */
  async #requireClean(repo: Repository, to: Tree): Promise<void> {
    const problem = switchProblem(headTree(repo), repo.index, await this.#unstaged(repo), to);
    if (problem !== null) throw new Error(problem);
  }

  /** Makes the working tree and the index hold `to` instead of `from`, leaving untracked files. */
  async #switchTree(from: Tree, to: Tree): Promise<void> {
    for (const path of from.keys()) {
      if (!to.has(path)) await this.#files.remove(path);
    }
    for (const [path, content] of to) await this.#files.write(path, content);
    const repo = this.#requireRepo();
    repo.index = new Map(to);
  }
}
