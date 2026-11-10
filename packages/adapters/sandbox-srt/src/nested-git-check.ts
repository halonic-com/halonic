import { lstat, readFile, rename } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { gitlinkPaths, parseIndex } from "./git-index.ts";

/** What a gitlink's `.git` was at session start: absent, a folder, a link or a file and its text. */
type DotGit = string;

/** A repository whose index `git status` in the working folder reads. */
interface Repository {
  /** Its checkout, relative to the working folder: "" for the working folder itself. */
  readonly checkout: string;
  /** Its git folder, as the checkout's `.git` named it at session start. */
  readonly gitFolder: string;
}

/** The nested repositories of a working folder's index, as they were at session start. */
export interface NestedGitSnapshot {
  readonly workingFolder: string;
  /** The working folder's repository, then each checked-out submodule, nested ones too. */
  readonly repositories: readonly Repository[];
  /** Each gitlink of those repositories, relative to the working folder, and what its `.git` is. */
  readonly dotGits: ReadonlyMap<string, DotGit>;
}

/**
 * Records each gitlink in `<workingFolder>/.git/index` (and its shared index,
 * when the index is split) and what its `.git` is, then does the same in the
 * index of each submodule that is checked out, since `git status` looks into
 * those too. Nothing is recorded when `.git` is not a real folder (a linked
 * worktree or a submodule) or has no index.
 *
 * @throws when an index can't be read, since its gitlinks can't be checked then.
 */
export async function snapshotNestedGit(workingFolder: string): Promise<NestedGitSnapshot | null> {
  const top = { checkout: "", gitFolder: join(workingFolder, ".git") };
  if ((await lstat(top.gitFolder).catch(() => null))?.isDirectory() !== true) return null;
  const repositories: Repository[] = [];
  const dotGits = new Map<string, DotGit>();
  const seen = new Set<string>();
  const queue: Repository[] = [top];
  // Each submodule found is pushed onto the queue, so the loop reaches nested ones too.
  for (const repository of queue) {
    if (seen.has(repository.gitFolder)) continue;
    seen.add(repository.gitFolder);
    const paths = await gitlinks(repository.gitFolder).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      const checkout = join(workingFolder, repository.checkout);
      throw new Error(
        `can't read the git index in ${checkout} (${reason}), so its submodules can't be ` +
          "checked at session end. Run `git status` there to check the index, then open the session again.",
      );
    });
    // A submodule's git folder that isn't there: `git status` has no index to read there either.
    if (paths === null) continue;
    repositories.push(repository);
    for (const path of paths) {
      const checkout = join(repository.checkout, path);
      const dotGit = await describe(workingFolder, checkout);
      dotGits.set(checkout, dotGit);
      const gitFolder = submoduleGitFolder(join(workingFolder, checkout), dotGit);
      if (gitFolder !== null) queue.push({ checkout, gitFolder });
    }
  }
  return { workingFolder, repositories, dotGits };
}

/**
 * Moves aside the `.git` of each gitlink the program added to an index, or
 * whose `.git` it made or changed. `git status` in the working folder looks
 * into every gitlink with a `.git` and reads that repository's settings, so a
 * repository the program made could run a command (`core.fsmonitor`) on the
 * user's next `git status`. Moved aside to `.git.halonic-blocked`, nothing of
 * the program's work is lost, and the folder is a plain folder to git.
 *
 * This covers a submodule that is not checked out at session start too: its
 * `.git` can't be denied (git refuses the empty file the fence would put
 * there), so one the program writes is undone here. That holds for a nested
 * submodule in a checked-out one as well, found through the checked-out
 * one's own index in its git folder. The gitlinks recorded at start count
 * even when the program took them out of an index or broke it, since
 * restoring the index would bring them back.
 *
 * @returns the `.git` paths it moved aside and those it could not (or an
 *   index, when it can't be read), relative to the working folder.
 */
export async function undoNestedGit(
  snapshot: NestedGitSnapshot,
): Promise<{ undone: string[]; failed: string[] }> {
  const undone: string[] = [];
  const failed: string[] = [];
  const paths = new Set(snapshot.dotGits.keys());
  for (const repository of snapshot.repositories) {
    const now = await gitlinks(repository.gitFolder).catch(() => null);
    // An index this reader can't read any more is itself a change it can't vouch for.
    if (now === null)
      failed.push(relative(snapshot.workingFolder, join(repository.gitFolder, "index")));
    for (const path of now ?? []) paths.add(join(repository.checkout, path));
  }
  for (const path of paths) {
    const current = await describe(snapshot.workingFolder, path);
    if (current === "absent" || current === snapshot.dotGits.get(path)) continue;
    try {
      if (!(await insideWithoutLinks(snapshot.workingFolder, path))) throw new Error("unsafe path");
      const dotGit = join(snapshot.workingFolder, path, ".git");
      await rename(dotGit, await freeName(`${dotGit}.halonic-blocked`));
      undone.push(join(path, ".git"));
    } catch {
      failed.push(join(path, ".git"));
    }
  }
  return { undone, failed };
}

/**
 * The git folder of a checked-out submodule, from what its `.git` was at
 * session start: the folder itself, or the one a `gitdir:` file names
 * (usually `.git/modules/<name>` of the repository above). Null when it is
 * not checked out.
 */
function submoduleGitFolder(checkout: string, dotGit: DotGit): string | null {
  if (dotGit === "folder") return join(checkout, ".git");
  const gitdir = /^file:gitdir: ([^\n]+)/.exec(dotGit)?.[1]?.replace(/\r$/, "");
  return gitdir === undefined ? null : resolve(checkout, gitdir);
}

/** The gitlinks in a git folder's index, or null when the git folder is not a real folder. */
async function gitlinks(gitFolder: string): Promise<string[] | null> {
  if ((await lstat(gitFolder).catch(() => null))?.isDirectory() !== true) return null;
  const index = await readPlainFile(join(gitFolder, "index"));
  if (index === null) return [];
  const config = await readFile(join(gitFolder, "config"), "utf8").catch(() => "");
  const hashLength = /^\s*objectformat\s*=\s*sha256\s*$/im.test(config) ? 32 : 20;
  const parsed = parseIndex(index, hashLength);
  if (parsed.sharedIndex === null) return gitlinkPaths(parsed, null);
  // A split index keeps most entries, gitlinks too, in the shared index it links to.
  const shared = await readPlainFile(join(gitFolder, parsed.sharedIndex));
  if (shared === null) throw new Error(`the shared index ${parsed.sharedIndex} is missing`);
  return gitlinkPaths(parsed, parseIndex(shared, hashLength));
}

/**
 * The bytes of a file the program could have replaced, or null when there is
 * none. Never reads anything but a plain file, so a pipe can't hold up `close()`.
 */
async function readPlainFile(path: string): Promise<Buffer | null> {
  const stat = await lstat(path).catch(() => null);
  if (stat === null) return null;
  if (!stat.isFile()) throw new Error(`${path} is not a plain file`);
  return readFile(path);
}

async function describe(workingFolder: string, path: string): Promise<DotGit> {
  if (!(await insideWithoutLinks(workingFolder, path))) return "unsafe";
  const dotGit = join(workingFolder, path, ".git");
  const stat = await lstat(dotGit).catch(() => null);
  if (stat === null) return "absent";
  if (stat.isDirectory()) return "folder";
  if (!stat.isFile()) return "other";
  return `file:${await readFile(dotGit, "utf8")}`;
}

/**
 * Whether `path`, from the index the program could write, stays inside the
 * working folder with no link on the way: the host must not be led out of it.
 */
async function insideWithoutLinks(workingFolder: string, path: string): Promise<boolean> {
  const clean = normalize(path);
  if (isAbsolute(clean) || clean === ".." || clean.startsWith(`..${sep}`)) return false;
  let current = workingFolder;
  for (const part of clean.split(sep)) {
    current = join(current, part);
    const stat = await lstat(current).catch(() => null);
    if (stat === null) return true;
    if (!stat.isDirectory()) return false;
  }
  return true;
}

async function freeName(base: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const name = attempt === 0 ? base : `${base}-${attempt}`;
    if ((await lstat(name).catch(() => null)) === null) return name;
  }
}
