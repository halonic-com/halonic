import {
  checkCommitId,
  checkProposalRef,
  type Vcs,
  type VcsApplyOptions,
  type VcsCommit,
  type VcsCommitVersionOptions,
  type VcsCommitWorktreeOptions,
  type VcsFileDiff,
  type VcsStatus,
  type VcsWorktree,
} from "@halonicjs/ports";
import { parsePatch } from "./text-patch.ts";
import { checkBranchName, checkVcsPath } from "./vcs-input.ts";
import { versionScope } from "./vcs-version-scope.ts";

/** One change a {@link DryRunVcs} was asked to make, in the order it was asked. */
export type PlannedVcsChange =
  | {
      readonly kind: "stage" | "unstage" | "discard";
      readonly paths: readonly string[];
    }
  | { readonly kind: "commit"; readonly message: string }
  | {
      readonly kind: "commitVersion";
      readonly message: string;
      readonly include?: readonly string[];
      readonly exclude: readonly string[];
    }
  | {
      readonly kind: "commitWorktreeTo";
      readonly worktreeId: string;
      readonly ref: string;
      readonly parent: string;
    }
  | { readonly kind: "deleteRef"; readonly ref: string }
  | { readonly kind: "checkout" | "createBranch"; readonly branch: string }
  | { readonly kind: "rename"; readonly from: string; readonly to: string }
  | { readonly kind: "addWorktree"; readonly version: string }
  | { readonly kind: "removeWorktree"; readonly id: string }
  | { readonly kind: "applyPatch"; readonly patch: string; readonly reverse: boolean }
  | { readonly kind: "init" | "pull" | "push" };

/**
 * A dry run of another repository: it reads through to that repository, but
 * only records every call that would change the working tree, the index,
 * the branches or a remote, so nothing changes. `changes()` then reports what
 * would have happened, as Compose's `pkg/dryrun` does for its service.
 *
 * Unlike the dry-run definition store, reads don't show the recorded changes:
 * `status`, `diff`, `log`, `branches`, `readAt` and `listAt` describe the
 * real repository, and so do `listWorktrees`, `diffBetween` and `readRef`. `snapshot`
 * is read through too: it adds a commit on no branch and changes neither the
 * working tree, the index nor a branch. A recorded worktree gets an id and a
 * folder starting `dry-run:`, which no real worktree has. Git's
 * state is too large to replay in memory, and `push` reaches another machine.
 * So the `Vcs` contract, which expects a commit to show up in the log, does
 * not apply.
 *
 * Before recording a change, it refuses what the real repository would refuse
 * from the input alone: an unsafe or private path, a path the repository
 * refuses to diff (such as one through a link), an invalid branch name, an
 * empty commit message, and any change to a folder that isn't a repository
 * and isn't about to be made one. It doesn't predict refusals that depend on
 * the repository's state, such as nothing staged, a checkout over changes or
 * a push the remote rejects.
 */
export class DryRunVcs implements Vcs {
  readonly #source: Vcs;
  readonly #changes: PlannedVcsChange[] = [];

  /** @param source - the repository the dry run reads; it is never changed */
  constructor(source: Vcs) {
    this.#source = source;
  }

  status(): Promise<VcsStatus> {
    return this.#source.status();
  }

  diff(path: string, staged: boolean): Promise<string> {
    return this.#source.diff(path, staged);
  }

  log(limit: number): Promise<VcsCommit[]> {
    return this.#source.log(limit);
  }

  branches(): Promise<string[]> {
    return this.#source.branches();
  }

  remotes(): Promise<string[]> {
    return this.#source.remotes();
  }

  snapshot(): Promise<string> {
    return this.#source.snapshot();
  }

  readAt(version: string, path: string): Promise<string | null> {
    return this.#source.readAt(version, path);
  }

  listAt(version: string, dir?: string): Promise<string[] | null> {
    return this.#source.listAt(version, dir);
  }

  async rename(from: string, to: string): Promise<void> {
    checkVcsPath(from);
    checkVcsPath(to);
    await this.#checkRepository();
    this.#record({ kind: "rename", from, to });
  }

  listWorktrees(): Promise<VcsWorktree[]> {
    return this.#source.listWorktrees();
  }

  diffBetween(version: string, worktreeId: string): Promise<VcsFileDiff[]> {
    return this.#source.diffBetween(version, worktreeId);
  }

  /** Records the worktree after checking the repository has the version. */
  async addWorktree(version: string): Promise<VcsWorktree> {
    checkCommitId(version);
    await this.#source.listAt(version);
    this.#record({ kind: "addWorktree", version });
    const added = this.#changes.filter((change) => change.kind === "addWorktree").length;
    const id = `dry-run:worktree-${added}`;
    return { id, path: id, version };
  }

  /** Records the removal after checking the worktree exists, counting the recorded changes in. */
  async removeWorktree(id: string): Promise<void> {
    const isRepo = await this.#checkRepository();
    if (!(await this.#hasWorktree(id, isRepo))) throw new Error(`Unknown worktree ${id}.`);
    this.#record({ kind: "removeWorktree", id });
  }

  /** Records the patch after reading it and checking its paths; whether it would apply isn't predicted. */
  async applyPatch(patch: string, options: VcsApplyOptions = {}): Promise<void> {
    for (const file of parsePatch(patch)) {
      for (const path of [file.oldPath, file.newPath]) if (path !== null) checkVcsPath(path);
    }
    await this.#checkRepository();
    this.#record({ kind: "applyPatch", patch, reverse: options.reverse === true });
  }

  async stage(paths: string[]): Promise<void> {
    await this.#checkPaths(paths);
    this.#record({ kind: "stage", paths: Object.freeze([...paths]) });
  }

  async unstage(paths: string[]): Promise<void> {
    await this.#checkPaths(paths);
    this.#record({ kind: "unstage", paths: Object.freeze([...paths]) });
  }

  async discard(paths: string[]): Promise<void> {
    await this.#checkPaths(paths);
    this.#record({ kind: "discard", paths: Object.freeze([...paths]) });
  }

  /** Records the commit and returns a made-up hash starting `dry-run:`, which no real commit has. */
  async commit(message: string): Promise<string> {
    await this.#checkRepository();
    // Like git, which aborts on an empty message.
    if (message.trim() === "") throw new Error("The commit message is empty.");
    this.#record({ kind: "commit", message });
    return `dry-run:commit-${this.#count("commit", "commitVersion")}`;
  }

  /** Records Create version and returns a made-up hash starting `dry-run:`, as {@link DryRunVcs.commit} does. */
  async commitVersion(options: VcsCommitVersionOptions): Promise<string> {
    const { include, exclude } = versionScope(options);
    await this.#checkPaths([...(include ?? []), ...exclude]);
    if (options.message.trim() === "") throw new Error("The commit message is empty.");
    const change: Extract<PlannedVcsChange, { kind: "commitVersion" }> = {
      kind: "commitVersion",
      message: options.message,
      exclude: Object.freeze([...exclude]),
    };
    // Absent, not empty, when every change is committed: `include: []` is refused above.
    this.#record(
      include === undefined ? change : { ...change, include: Object.freeze([...include]) },
    );
    return `dry-run:commit-${this.#count("commit", "commitVersion")}`;
  }

  /**
   * Records the proposal after checking the ref, and that the repository
   * has the parent, and returns a made-up hash starting `dry-run:`. Whether
   * the ref already exists or the worktree is known isn't predicted.
   */
  async commitWorktreeTo(
    worktreeId: string,
    ref: string,
    options: VcsCommitWorktreeOptions,
  ): Promise<string> {
    checkProposalRef(ref);
    checkCommitId(options.parent);
    await this.#source.listAt(options.parent);
    this.#record({ kind: "commitWorktreeTo", worktreeId, ref, parent: options.parent });
    return `dry-run:proposal-${this.#count("commitWorktreeTo")}`;
  }

  readRef(ref: string): Promise<string | null> {
    return this.#source.readRef(ref);
  }

  async deleteRef(ref: string): Promise<void> {
    checkProposalRef(ref);
    await this.#checkRepository();
    this.#record({ kind: "deleteRef", ref });
  }

  async checkout(branch: string): Promise<void> {
    checkBranchName(branch);
    await this.#checkRepository();
    this.#record({ kind: "checkout", branch });
  }

  async createBranch(name: string): Promise<void> {
    checkBranchName(name);
    await this.#checkRepository();
    this.#record({ kind: "createBranch", branch: name });
  }

  async init(): Promise<void> {
    this.#record({ kind: "init" });
  }

  async pull(): Promise<void> {
    await this.#checkRepository();
    this.#record({ kind: "pull" });
  }

  async push(): Promise<void> {
    await this.#checkRepository();
    this.#record({ kind: "push" });
  }

  /** Every change asked for so far, in order: what a real run would have done. Each entry is frozen. */
  changes(): PlannedVcsChange[] {
    return [...this.#changes];
  }

  /** How many changes of those kinds are recorded so far. */
  #count(...kinds: PlannedVcsChange["kind"][]): number {
    return this.#changes.filter((change) => kinds.includes(change.kind)).length;
  }

  #record(change: PlannedVcsChange): void {
    this.#changes.push(Object.freeze(change));
  }

  /**
   * Whether the worktree exists once the recorded changes are counted in. A
   * folder only about to be made a repository has no worktrees of its own.
   */
  async #hasWorktree(id: string, isRepo: boolean): Promise<boolean> {
    const removed = this.#changes.some(
      (change) => change.kind === "removeWorktree" && change.id === id,
    );
    if (removed) return false;
    // Recorded worktrees are numbered from 1, as addWorktree makes their ids.
    const added = Array.from(
      { length: this.#count("addWorktree") },
      (_, index) => `dry-run:worktree-${index + 1}`,
    );
    if (added.includes(id)) return true;
    if (!isRepo) return false;
    return (await this.#source.listWorktrees()).some((worktree) => worktree.id === id);
  }

  /** Throws, as the real repository would, when the folder isn't one and no `init` is recorded. */
  async #checkRepository(): Promise<boolean> {
    const isRepo = (await this.#source.status()).isRepo;
    if (!isRepo && !this.#changes.some((change) => change.kind === "init")) {
      throw new Error("The workspace folder is not a repository.");
    }
    return isRepo;
  }

  /**
   * Throws when the real repository would refuse one of the paths. Asking it
   * for a diff runs its own checks, such as the refusal of a path through a
   * link, without changing anything. A folder only about to be made a
   * repository has none to ask, so there only the path rules apply.
   */
  async #checkPaths(paths: string[]): Promise<void> {
    paths.forEach(checkVcsPath);
    if (!(await this.#checkRepository())) return;
    for (const path of paths) {
      await this.#source.diff(path, false);
    }
  }
}
