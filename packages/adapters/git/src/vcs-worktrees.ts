import { randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  checkCommitId,
  isPrivateWorkspacePath,
  type VcsDiffStatus,
  type VcsFileDiff,
  type VcsWorktree,
} from "@halonicjs/ports";
import type { ConfigEntry } from "./hardening.ts";
import type { Repository, WorktreeLocation } from "./repository.ts";
import { isInside, linksInGitFolder } from "./repository-location.ts";
import { checkKnownVersion, nulSeparated } from "./vcs-versions.ts";

/**
 * An id this adapter gives: `wt-`, the time it was added in base 36, and a
 * random part. The time first, so sorting by id lists the oldest first. No
 * `/`, `.` or leading `-`, so an id is never a path or an option.
 */
const worktreeIdPattern = /^wt-[0-9a-z]{9}-[0-9a-f]{8}$/u;

/** The file in git's record of a worktree that holds the commit it was added at. */
const versionFile = "halonic-version";

/** One worktree's folder and git's record of it. */
interface Worktree extends WorktreeLocation {
  id: string;
}

/**
 * The worktrees of one repository, each in its own folder inside
 * `folder`, which is outside the workspace (the app's data folder). Each
 * is a git worktree, detached, whose folder name is its id, so git's record
 * of it is `.git/worktrees/<id>`.
 *
 * Git is always told where a worktree's record and folder are (see
 * {@link WorktreeLocation}), after checking that the record points back at
 * the folder: never through the `.git` file in the folder (HAL-3188).
 */
export class GitWorktrees {
  readonly #folder: string | undefined;

  /** @param folder - where the worktrees go; without one, `add` refuses and there are none */
  constructor(folder: string | undefined) {
    this.#folder = folder;
  }

  /**
   * Checks `version` out into a new worktree, without the private entries
   * it has.
   *
   * @throws as `readAt` for the version, and when the worktrees folder is
   *   missing or inside the workspace, or holds it
   */
  async add(repository: Repository, version: string): Promise<VcsWorktree> {
    checkCommitId(version);
    await checkKnownVersion(repository, version);
    const id = newWorktreeId();
    const worktree = worktreeIn(repository, await this.#checkedFolder(repository), id);
    try {
      // `--no-checkout`, so the private entries can be left out below.
      const args = ["worktree", "add", "--detach", "--no-checkout", "--quiet"];
      await repository.output({ args: [...args, "--", worktree.folder, version] });
      await checkUsable(repository, await this.#known(repository, id));
      await writeFile(join(worktree.gitDir, versionFile), `${version}\n`);
      await checkOut(repository, worktree, version);
    } catch (error) {
      await removeWorktree(worktree);
      throw error;
    }
    return { id, path: worktree.folder, version };
  }

  /**
   * Deletes a worktree's folder, whatever is in it, and git's record of it.
   *
   * @throws Error `Unknown worktree <id>` for an id this adapter didn't give, or whose record is gone
   */
  async remove(repository: Repository, id: string): Promise<void> {
    const worktree = await this.#known(repository, id);
    await removeWorktree(worktree);
  }

  /** The worktrees whose record and folder are both still there, oldest first. */
  async list(repository: Repository): Promise<VcsWorktree[]> {
    const folder = await this.#existingFolder();
    if (folder === null) return [];
    const ids = await readdir(join(repository.gitDir, "worktrees")).catch(noEntries);
    const found: VcsWorktree[] = [];
    for (const id of ids.filter((each) => worktreeIdPattern.test(each)).sort()) {
      const worktree = worktreeIn(repository, folder, id);
      if (!(await pointsBack(worktree)) || !(await isFolder(worktree.folder))) continue;
      const version = await readVersion(worktree);
      if (version !== null) found.push({ id, path: worktree.folder, version });
    }
    return found;
  }

  /**
   * Every public file that differs between `version` and the worktree's
   * files on disk, sorted by path, with a diff each. It works on a copy of
   * the worktree's index in git's record, so neither the worktree nor the
   * workspace changes.
   *
   * @throws as `readAt` for the version, and as {@link GitWorktrees.remove} for the id
   */
  async diff(repository: Repository, version: string, id: string): Promise<VcsFileDiff[]> {
    checkCommitId(version);
    await checkKnownVersion(repository, version);
    const worktree = await this.usable(repository, id);
    const indexFile = join(worktree.gitDir, `halonic-diff-${randomUUID()}.index`);
    const onCopy = (args: readonly string[]): Promise<Buffer> =>
      repository.output({ args, worktree, indexFile, config: diffConfig });
    try {
      await onCopy(["read-tree", version]);
      await onCopy(["add", "--all", "--", "."]);
      const changed = parseNameStatus(await onCopy([...diffArgs, "--name-status", version]));
      const diffs: VcsFileDiff[] = [];
      for (const { path, status } of changed.filter((each) => !isPrivateWorkspacePath(each.path))) {
        const diff = (await onCopy([...diffArgs, version, "--", path])).toString("utf8");
        diffs.push({ path, status, diff });
      }
      // By UTF-16 code unit, whatever the locale, as the memory adapter and
      // `listAt` sort paths. Git's own order is by UTF-8 byte, which only
      // differs for a path mixing characters beyond U+FFFF with U+E000-U+FFFF.
      return diffs.sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
    } finally {
      await rm(indexFile, { force: true });
    }
  }

  /**
   * The worktree `id` names, ready for git to run in: its folder is there
   * and its record passes every check.
   *
   * @throws as {@link GitWorktrees.remove}, and when the record was changed
   */
  async usable(repository: Repository, id: string): Promise<WorktreeLocation> {
    const worktree = await this.#known(repository, id);
    if (!(await isFolder(worktree.folder))) throw unknownWorktree(id);
    await checkUsable(repository, worktree);
    return worktree;
  }

  /**
   * The worktree `id` names: one this adapter gave, whose record in the
   * repository points back at its folder. The folder itself may be gone.
   */
  async #known(repository: Repository, id: string): Promise<Worktree> {
    const folder = await this.#existingFolder();
    if (!worktreeIdPattern.test(id) || folder === null) throw unknownWorktree(id);
    const worktree = worktreeIn(repository, folder, id);
    if (!(await isFolder(worktree.gitDir)) || !(await pointsBack(worktree))) {
      throw unknownWorktree(id);
    }
    return worktree;
  }

  /** The worktrees folder as a real path, made if it isn't there, and never inside the workspace or holding it. */
  async #checkedFolder(repository: Repository): Promise<string> {
    if (this.#folder === undefined) {
      throw new Error("This git Vcs has no folder for worktrees: give one when making it.");
    }
    await mkdir(this.#folder, { recursive: true });
    const folder = await realpath(this.#folder);
    if (isInside(repository.top, folder) || isInside(folder, repository.top)) {
      throw new Error(
        `The worktrees folder ${folder} can't be inside the workspace ${repository.top}, or hold it.`,
      );
    }
    return folder;
  }

  async #existingFolder(): Promise<string | null> {
    if (this.#folder === undefined) return null;
    return realpath(this.#folder).catch(() => null);
  }
}

/**
 * The options of every diff here: index against a commit, no renames, so
 * a status is only added, modified or deleted, and the prefixes and paths
 * the port's patches use, whatever the repository's config says.
 */
const diffArgs: readonly string[] = [
  "diff",
  "--cached",
  "--no-color",
  "--no-renames",
  "--no-relative",
  "--ignore-submodules=all",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "-z",
];

/** Paths with letters beyond ASCII as they are, not quoted, so `applyPatch` takes their diffs. */
const diffConfig: readonly ConfigEntry[] = [["core.quotePath", "false"]];

function newWorktreeId(): string {
  const time = Date.now().toString(36).padStart(9, "0");
  return `wt-${time}-${randomBytes(4).toString("hex")}`;
}

function worktreeIn(repository: Repository, folder: string, id: string): Worktree {
  return { id, folder: join(folder, id), gitDir: join(repository.gitDir, "worktrees", id) };
}

/**
 * Fills a new worktree's index from `version` and writes its files, but
 * not the private entries: those leave the index first, so a `.env` the
 * commit has never reaches the folder.
 */
async function checkOut(repository: Repository, worktree: Worktree, version: string) {
  const inWorktree = (args: readonly string[]): Promise<Buffer> =>
    repository.output({ args, worktree });
  await inWorktree(["read-tree", version]);
  const leftOut = nulSeparated(await inWorktree(["ls-files", "-z"])).filter(isPrivateWorkspacePath);
  if (leftOut.length > 0) await inWorktree(["rm", "--cached", "--quiet", "--", ...leftOut]);
  await inWorktree(["checkout-index", "--all", "--quiet"]);
}

/**
 * Before git runs in a worktree: refuses a record that isn't git's ordinary
 * one, sharing the workspace's repository. One that names another
 * repository, holds a link, which git would follow, or has a
 * `config.worktree`, whose programs the repository's checks never see.
 * Removing the worktree runs no git, so it still works.
 *
 * @throws Error saying the record was changed
 */
async function checkUsable(repository: Repository, worktree: Worktree): Promise<void> {
  const commonDir = await readLine(join(worktree.gitDir, "commondir"));
  const sharesRepository =
    commonDir !== null && resolve(worktree.gitDir, commonDir) === repository.gitDir;
  const links = await linksInGitFolder(worktree.gitDir);
  const worktreeConfig = await lstat(join(worktree.gitDir, "config.worktree")).catch(() => null);
  if (!sharesRepository || links.length > 0 || worktreeConfig !== null) {
    throw new Error(
      `Git's record of the worktree ${worktree.id} was changed, so Halonic won't use it. Remove the worktree and add it again.`,
    );
  }
}

/** Whether git's record of the worktree names its folder's `.git` as the worktree's. */
async function pointsBack(worktree: Worktree): Promise<boolean> {
  const gitdir = await readLine(join(worktree.gitDir, "gitdir"));
  return gitdir !== null && resolve(worktree.gitDir, gitdir) === join(worktree.folder, ".git");
}

async function readVersion(worktree: Worktree): Promise<string | null> {
  const version = await readLine(join(worktree.gitDir, versionFile));
  try {
    checkCommitId(version ?? "");
    return version;
  } catch {
    // Not one this adapter wrote: the worktree isn't listed.
    return null;
  }
}

/** Deletes the folder first, so a worktree whose record is still there is never half listed. */
async function removeWorktree(worktree: Worktree): Promise<void> {
  // `rm` deletes a link in the folder, never what it leads to.
  await rm(worktree.folder, { recursive: true, force: true });
  await rm(worktree.gitDir, { recursive: true, force: true });
}

const statusOfLetter: Readonly<Record<string, VcsDiffStatus>> = { A: "added", D: "deleted" };

/** The changed files in `diff --name-status -z`: a status letter, then a path. */
function parseNameStatus(output: Buffer): { path: string; status: VcsDiffStatus }[] {
  const entries = nulSeparated(output);
  const changed: { path: string; status: VcsDiffStatus }[] = [];
  for (let at = 0; at + 1 < entries.length; at += 2) {
    // `M`, or `T` for a file whose type changed, is a modification.
    const status = statusOfLetter[entries[at] as string] ?? "modified";
    changed.push({ path: entries[at + 1] as string, status });
  }
  return changed;
}

/** A file's first line, without its line ending; `null` when the file isn't there. */
async function readLine(path: string): Promise<string | null> {
  const text = await readFile(path, "utf8").catch(() => null);
  return text === null ? null : (text.split(/\r?\n/u)[0] as string);
}

async function isFolder(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null))?.isDirectory() === true;
}

function unknownWorktree(id: string): Error {
  return new Error(`Unknown worktree ${id}`);
}

function noEntries(error: unknown): string[] {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
  throw error;
}
