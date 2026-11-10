import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  checkCommitId,
  checkProposalRef,
  isPrivateWorkspacePath,
  unversionedFolders,
  type VcsCommitVersionOptions,
} from "@halonicjs/ports";
import type { ConfigEntry } from "./hardening.ts";
import type { Repository, RepositoryCall, WorktreeLocation } from "./repository.ts";
import { checkVcsPaths } from "./vcs-input.ts";
import { checkKnownVersion, nulSeparated } from "./vcs-versions.ts";

/** What a commit made here needs besides its tree: who makes it, and the message. */
interface CommitInput {
  author: readonly ConfigEntry[];
  message: string;
}

/**
 * Create version: commits the changes on disk that are in scope (under
 * `include`, not under `exclude`, never a private entry or an unversioned
 * folder) on the current branch, and gives the new commit's id.
 *
 * It builds the tree in a temporary index under `.git`, from HEAD: `add
 * --all`, then every changed path out of scope goes back to HEAD. Never
 * `git commit -- <paths>`, which commits the working tree's content of every
 * tracked path it names. HEAD moves with `update-ref` from the commit it was
 * at, so a commit made in between is never lost. The real index then takes
 * the new commit's content for the paths the version changed, and only
 * those, so a change left out stays staged as it was. The working tree is
 * never touched.
 *
 * @throws RangeError for a path the port refuses, or an empty `include`
 * @throws Error for an empty message, when every change is left out, or when HEAD moved meanwhile
 */
export async function commitVersionOf(
  repository: Repository,
  options: VcsCommitVersionOptions,
  author: readonly ConfigEntry[],
): Promise<string> {
  const { include, exclude, message } = options;
  if (include !== undefined && include.length === 0) {
    throw new RangeError("Give at least one path to include, or leave include out.");
  }
  await checkVcsPaths(repository.top, [...(include ?? []), ...exclude]);
  if (message.trim() === "") throw new Error("A version needs a message.");
  const inScope = (path: string): boolean =>
    !isPrivateWorkspacePath(path) &&
    !isUnderAny(path, unversionedFolders) &&
    (include === undefined || isUnderAny(path, include)) &&
    !isUnderAny(path, exclude);

  const head = await currentCommit(repository);
  const tree = await withIndexCopy(repository, null, async (onCopy) => {
    await onCopy(head === null ? ["read-tree", "--empty"] : ["read-tree", head]);
    await onCopy(["add", "--all", "--", "."]);
    const changed = nulSeparated(await onCopy(changedPathsArgs(head)));
    await backToHead(
      onCopy,
      head,
      changed.filter((path) => !inScope(path)),
    );
    // Like `commit` with nothing staged.
    const left = nulSeparated(await onCopy(changedPathsArgs(head)));
    if (left.length === 0) throw new Error("Nothing to commit: every change is left out.");
    return text(await onCopy(["write-tree"]));
  });
  const version = await commitTree(repository, tree, head, { author, message });
  const from = head ?? "0".repeat(version.length);
  const moved = await repository.run({ args: ["update-ref", "HEAD", version, from] });
  if (moved.code !== 0) {
    throw new Error("The history changed while the version was being made. Try again.");
  }
  const committed = await repository.output({ args: committedPathsArgs(head, version) });
  await backToHead((args) => repository.output({ args }), version, nulSeparated(committed));
  return version;
}

/**
 * Commits a worktree's files on disk, new ones included, ignored files and
 * private entries left out, with `parent` as the only parent, and creates
 * the proposal ref `ref` at it. `update-ref` with an all-zero old id creates
 * the ref only if it isn't there, so a proposal is never overwritten.
 *
 * @throws RangeError for a ref that isn't a proposal ref, or a parent that isn't a full commit id
 * @throws Error when the parent is unknown, or the ref already exists
 */
export async function commitWorktreeOnto(
  repository: Repository,
  worktree: WorktreeLocation,
  ref: string,
  parent: string,
  author: readonly ConfigEntry[],
): Promise<string> {
  const tree = await withIndexCopy(repository, worktree, async (onCopy) => {
    await onCopy(["read-tree", "--empty"]);
    await onCopy(["add", "--all", "--", "."]);
    const leftOut = nulSeparated(await onCopy(["ls-files", "-z"])).filter(isPrivateWorkspacePath);
    if (leftOut.length > 0) await onCopy(["rm", "--cached", "--quiet", "--", ...leftOut]);
    return text(await onCopy(["write-tree"]));
  });
  const proposal = await commitTree(repository, tree, parent, {
    author,
    message: `Proposal ${ref}`,
  });
  const created = await repository.run({
    args: ["update-ref", ref, proposal, "0".repeat(proposal.length)],
  });
  if (created.code !== 0) throw new Error(`The ref ${ref} already exists.`);
  return proposal;
}

/**
 * The commit a proposal ref points at, or `null` when there is none.
 * `show-ref --verify` reads exactly that ref; `rev-parse` would fall back to
 * a branch or tag of the same name.
 *
 * @throws RangeError for a ref that isn't a proposal ref
 */
export async function readProposalRef(repository: Repository, ref: string): Promise<string | null> {
  checkProposalRef(ref);
  const found = await repository.run({ args: ["show-ref", "--verify", "--hash", "--", ref] });
  return found.code === 0 ? text(found.stdout) : null;
}

/**
 * Deletes a proposal ref. `update-ref -d` alone succeeds on a missing ref,
 * so it is given the commit the ref points at, and fails if that changed.
 *
 * @throws RangeError for a ref that isn't a proposal ref
 * @throws Error when there is no such ref
 */
export async function deleteProposalRef(repository: Repository, ref: string): Promise<void> {
  const at = await readProposalRef(repository, ref);
  if (at === null) throw new Error(`There is no ref ${ref}.`);
  await repository.output({ args: ["update-ref", "-d", ref, at] });
}

/** Checks a proposal's ref and parent the way the port says, before anything runs. */
export async function checkProposal(
  repository: Repository,
  ref: string,
  parent: string,
): Promise<void> {
  checkProposalRef(ref);
  checkCommitId(parent);
  await checkKnownVersion(repository, parent);
}

type OnCopy = (args: readonly string[]) => Promise<Buffer>;

/** Runs `work` on a new index file in git's own folder (the worktree's record for a worktree), then removes it. */
async function withIndexCopy<T>(
  repository: Repository,
  worktree: WorktreeLocation | null,
  work: (onCopy: OnCopy) => Promise<T>,
): Promise<T> {
  const folder = worktree === null ? repository.gitDir : worktree.gitDir;
  const indexFile = join(folder, `halonic-commit-${randomUUID()}.index`);
  const where: Partial<RepositoryCall> = worktree === null ? {} : { worktree };
  try {
    return await work((args) => repository.output({ ...where, args, indexFile }));
  } finally {
    await rm(indexFile, { force: true });
  }
}

/** Every path in the index that differs from `head`; every path in it when there is no commit yet. */
function changedPathsArgs(head: string | null): string[] {
  if (head === null) return ["ls-files", "-z"];
  return ["diff-index", "--cached", "--no-renames", "--name-only", "-z", head];
}

/** Every path `version` changed from `head`; every path in it when it is the first commit. */
function committedPathsArgs(head: string | null, version: string): string[] {
  if (head === null) return ["ls-tree", "-r", "--name-only", "-z", version];
  return ["diff-tree", "-r", "--no-renames", "--name-only", "-z", head, version];
}

/** Puts `paths` in the index back to `head`'s content, or out of it when there is no commit. */
async function backToHead(onIndex: OnCopy, head: string | null, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (head === null) await onIndex(["rm", "--cached", "--quiet", "--", ...paths]);
  else await onIndex(["reset", "--quiet", head, "--", ...paths]);
}

/** A commit of `tree`, never signed, with no hook run (the runner's hardening). */
async function commitTree(
  repository: Repository,
  tree: string,
  parent: string | null,
  input: CommitInput,
): Promise<string> {
  const parents = parent === null ? [] : ["-p", parent];
  // `-m` takes the next argument as the message, whatever it starts with.
  const args = ["commit-tree", "--no-gpg-sign", ...parents, "-m", input.message, tree];
  return text(await repository.output({ args, config: input.author }));
}

async function currentCommit(repository: Repository): Promise<string | null> {
  const result = await repository.run({ args: ["rev-parse", "--verify", "--quiet", "HEAD"] });
  return result.code === 0 ? text(result.stdout) : null;
}

function isUnderAny(path: string, folders: readonly string[]): boolean {
  return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function text(output: Buffer): string {
  return output.toString("utf8").trim();
}
