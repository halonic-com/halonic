import { appendFile, lstat, mkdir, rename as move, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  isPrivateWorkspacePath,
  type Vcs,
  type VcsApplyOptions,
  type VcsCommit,
  type VcsCommitVersionOptions,
  type VcsCommitWorktreeOptions,
  type VcsFileDiff,
  type VcsStatus,
  type VcsWorktree,
} from "@halonicjs/ports";
import {
  logArgs,
  noRepositoryStatus,
  outputLines,
  parseLog,
  parseStatus,
  statusArgs,
} from "./git-output.ts";
import type { GitRunner } from "./git-runner.ts";
import type { ConfigEntry } from "./hardening.ts";
import { inPathBatches } from "./path-batches.ts";
import { gitError, Repository } from "./repository.ts";
import {
  checkProposal,
  commitVersionOf,
  commitWorktreeOnto,
  deleteProposalRef,
  readProposalRef,
} from "./vcs-commits.ts";
import { checkBranchNameShape, checkNoFolders, checkVcsPaths } from "./vcs-input.ts";
import { applyToWorkingTree } from "./vcs-patch.ts";
import { pullFastForward, pushToUpstream } from "./vcs-remote.ts";
import { listAtCommit, readAtCommit, snapshotCommit } from "./vcs-versions.ts";
import { GitWorktrees } from "./vcs-worktrees.ts";

/** Who commits: git reads no user config, so the caller says. */
export interface GitAuthor {
  name: string;
  email: string;
}

/** What a {@link GitVcs} needs besides its folder. */
export interface GitVcsOptions {
  /** Starts git, hardened; one runner can serve many folders. */
  runner: GitRunner;
  /** The author and committer of every commit. */
  author: GitAuthor;
  /**
   * The folder that holds the worktrees, in the app's data folder: never
   * inside the workspace folder, nor holding it. Without one, `addWorktree`
   * refuses and there are no worktrees.
   */
  worktrees?: string;
}

/**
 * The `Vcs` port on the real git program, for one workspace folder, always
 * hardened (see the port's doc and {@link GitRunner}). The folder is a
 * repository only when it is a repository's root: git never looks above it.
 * Every call checks the repository again, since anyone who can write the
 * folder can change its config between calls.
 */
export class GitVcs implements Vcs {
  readonly #folder: string;
  readonly #runner: GitRunner;
  readonly #author: GitAuthor;
  readonly #worktrees: GitWorktrees;

  /** @param folder - the workspace folder, which need not be a repository yet */
  constructor(folder: string, options: GitVcsOptions) {
    this.#folder = folder;
    this.#runner = options.runner;
    this.#author = options.author;
    this.#worktrees = new GitWorktrees(options.worktrees);
  }

  async status(): Promise<VcsStatus> {
    const repository = await Repository.open(this.#runner, this.#folder);
    if (repository === null) return { ...noRepositoryStatus, changes: [] };
    const status = parseStatus(await repository.output({ args: statusArgs }));
    // A second guard behind `init`'s exclude: Halonic's runtime data in
    // `.studio`, and `.env` and the other private files, are never a
    // change, as `snapshot` and `listAt` never take them.
    status.changes = status.changes.filter(
      (change) =>
        !isPrivateWorkspacePath(change.path) &&
        (change.from === undefined || !isPrivateWorkspacePath(change.from)),
    );
    return status;
  }

  async diff(path: string, staged: boolean): Promise<string> {
    const repository = await this.#checkedRepository([path]);
    const which = staged ? ["--cached"] : [];
    // `Repository.run` adds `--no-ext-diff --no-textconv`.
    const args = ["diff", "--no-color", ...which, "--", path];
    return (await repository.output({ args })).toString("utf8");
  }

  async stage(paths: string[]): Promise<void> {
    const repository = await this.#checkedFiles(paths);
    // `--all` stages a deletion too; git refuses a path that matches nothing
    // and stages none of its batch.
    await inPathBatches(paths, (batch) =>
      repository.output({ args: ["add", "--all", "--", ...batch] }),
    );
  }

  async unstage(paths: string[]): Promise<void> {
    const repository = await this.#checkedFiles(paths);
    if (await hasCommit(repository)) {
      await inPathBatches(paths, (batch) =>
        repository.output({ args: ["reset", "--quiet", "--", ...batch] }),
      );
      return;
    }
    // Before the first commit there is no HEAD to reset to: take the files out of the index.
    await inPathBatches(paths, (batch) =>
      repository.output({
        args: ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", ...batch],
      }),
    );
  }

  async discard(paths: string[]): Promise<void> {
    const repository = await this.#checkedFiles(paths);
    const listed = await inPathBatches(paths, (batch) =>
      repository.output({ args: ["ls-files", "-z", "--", ...batch] }),
    );
    const tracked = new Set(listed.flatMap((output) => output.toString("utf8").split("\0")));
    const inIndex = paths.filter((path) => tracked.has(path));
    const untracked = paths.filter((path) => !tracked.has(path));
    await inPathBatches(inIndex, (batch) =>
      repository.output({ args: ["checkout", "--quiet", "--", ...batch] }),
    );
    await inPathBatches(untracked, (batch) =>
      repository.output({ args: ["clean", "--force", "--quiet", "--", ...batch] }),
    );
  }

  async commit(message: string): Promise<string> {
    if (message.trim() === "") throw new Error("A commit needs a message.");
    const repository = await this.#repository();
    // One argument, so a message such as `--amend` is only ever the message;
    // `whitespace` keeps a line that starts with `#`.
    const args = ["commit", "--quiet", "--cleanup=whitespace", `--message=${message}`];
    await repository.output({ args, config: this.#authorConfig() });
    return (await repository.output({ args: ["rev-parse", "HEAD"] })).toString("utf8").trim();
  }

  async log(limit: number): Promise<VcsCommit[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`The log limit must be a whole number of at least 1, not ${limit}.`);
    }
    const repository = await this.#repository();
    if (!(await hasCommit(repository))) return [];
    return parseLog(await repository.output({ args: logArgs(limit) }));
  }

  async branches(): Promise<string[]> {
    const repository = await this.#repository();
    const args = ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"];
    return outputLines(await repository.output({ args }));
  }

  async checkout(branch: string): Promise<void> {
    await this.#checkBranchName(branch);
    const repository = await this.#repository();
    const ref = `refs/heads/${branch}`;
    const found = await repository.run({ args: ["show-ref", "--verify", "--quiet", ref] });
    if (found.code !== 0) throw new Error(`There is no branch ${branch}.`);
    // `switch` only ever takes a branch, never a path, and refuses to lose a change or an untracked file.
    await repository.output({ args: ["switch", "--quiet", "--no-guess", branch] });
  }

  async createBranch(name: string): Promise<void> {
    await this.#checkBranchName(name);
    const repository = await this.#repository();
    await repository.output({ args: ["switch", "--quiet", "--create", name] });
  }

  async snapshot(): Promise<string> {
    return snapshotCommit(await this.#repository(), this.#authorConfig());
  }

  async readAt(version: string, path: string): Promise<string | null> {
    return readAtCommit(await this.#repository(), version, path);
  }

  async listAt(version: string, dir?: string): Promise<string[] | null> {
    return listAtCommit(await this.#repository(), version, dir);
  }

  async rename(from: string, to: string): Promise<void> {
    const repository = await this.#checkedRepository([from, to]);
    if (to === from || to.startsWith(`${from}/`)) {
      throw new Error(`Can't rename ${from} into itself.`);
    }
    const [source, target] = [join(repository.top, from), join(repository.top, to)];
    if (!(await exists(source))) throw new Error(`Can't rename: there is no ${from}.`);
    if (await exists(target)) throw new Error(`Can't rename ${from}: ${to} already exists.`);
    await mkdir(dirname(target), { recursive: true });
    const tracked = await repository.output({ args: ["ls-files", "-z", "--", from] });
    // `git mv` moves the index entries with the files, so the history follows them.
    if (tracked.length > 0) await repository.output({ args: ["mv", "--", from, to] });
    else await move(source, target);
  }

  async addWorktree(version: string): Promise<VcsWorktree> {
    return this.#worktrees.add(await this.#repository(), version);
  }

  async removeWorktree(id: string): Promise<void> {
    await this.#worktrees.remove(await this.#repository(), id);
  }

  async listWorktrees(): Promise<VcsWorktree[]> {
    return this.#worktrees.list(await this.#repository());
  }

  async diffBetween(version: string, worktreeId: string): Promise<VcsFileDiff[]> {
    return this.#worktrees.diff(await this.#repository(), version, worktreeId);
  }

  async applyPatch(patch: string, options?: VcsApplyOptions): Promise<void> {
    await applyToWorkingTree(await this.#repository(), patch, options?.reverse === true);
  }

  async commitVersion(options: VcsCommitVersionOptions): Promise<string> {
    return commitVersionOf(await this.#repository(), options, this.#authorConfig());
  }

  async commitWorktreeTo(
    worktreeId: string,
    ref: string,
    options: VcsCommitWorktreeOptions,
  ): Promise<string> {
    const repository = await this.#repository();
    await checkProposal(repository, ref, options.parent);
    const worktree = await this.#worktrees.usable(repository, worktreeId);
    return commitWorktreeOnto(repository, worktree, ref, options.parent, this.#authorConfig());
  }

  async readRef(ref: string): Promise<string | null> {
    return readProposalRef(await this.#repository(), ref);
  }

  async deleteRef(ref: string): Promise<void> {
    await deleteProposalRef(await this.#repository(), ref);
  }

  async init(): Promise<void> {
    if ((await Repository.open(this.#runner, this.#folder)) !== null) return;
    const folder = await realpath(this.#folder);
    // `--template=` copies no template hooks or config into the new repository.
    const args = ["init", "--quiet", "--template=", "--initial-branch=main"];
    const result = await this.#runner.run({ cwd: folder, args });
    if (result.code !== 0) throw gitError(args, result);
    // With no template there is no `info` folder yet.
    await mkdir(join(folder, ".git", "info"), { recursive: true });
    await appendFile(join(folder, ".git", "info", "exclude"), "/.studio/\n");
  }

  async remotes(): Promise<string[]> {
    const repository = await this.#repository();
    return outputLines(await repository.output({ args: ["remote"] }));
  }

  async pull(): Promise<void> {
    await pullFastForward(await this.#repository());
  }

  async push(): Promise<void> {
    await pushToUpstream(await this.#repository());
  }

  /** The repository, after checking `paths` the way the port says. */
  async #checkedRepository(paths: readonly string[]): Promise<Repository> {
    await checkVcsPaths(await realpath(this.#folder), paths);
    return this.#repository();
  }

  /** Like {@link #checkedRepository}, and refuses a folder, which git would take as every file inside it. */
  async #checkedFiles(paths: readonly string[]): Promise<Repository> {
    const top = await realpath(this.#folder);
    await checkVcsPaths(top, paths);
    await checkNoFolders(top, paths);
    return this.#repository();
  }

  async #repository(): Promise<Repository> {
    const repository = await Repository.open(this.#runner, this.#folder);
    if (repository === null) {
      throw new Error(`${this.#folder} isn't a git repository. Initialize it first.`);
    }
    return repository;
  }

  /** Refuses what git would read as something else, then asks git whether the rest is a branch name. */
  async #checkBranchName(name: string): Promise<void> {
    checkBranchNameShape(name);
    const args = ["check-ref-format", "--branch", name];
    const result = await this.#runner.run({ cwd: await realpath(this.#folder), args });
    if (result.code !== 0) {
      throw new RangeError(`Invalid branch name ${JSON.stringify(name)}: git doesn't allow it.`);
    }
  }

  #authorConfig(): ConfigEntry[] {
    return [
      ["user.name", this.#author.name],
      ["user.email", this.#author.email],
      ["user.useConfigOnly", "true"],
    ];
  }
}

/** Whether anything is at `path`, a link included. */
async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/** Whether the current branch has a commit yet. */
async function hasCommit(repository: Repository): Promise<boolean> {
  const result = await repository.run({ args: ["rev-parse", "--verify", "--quiet", "HEAD"] });
  return result.code === 0;
}
