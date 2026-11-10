import { lstat, readFile, rename } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { gitlinkPaths, parseIndex } from "./git-index.ts";

/** What a gitlink's `.git` was at session start: absent, a folder, a link or a file and its text. */
type DotGit = string;

/** The nested repositories of a working folder's index, as they were at session start. */
export interface NestedGitSnapshot {
  readonly workingFolder: string;
  readonly dotGits: ReadonlyMap<string, DotGit>;
}

/**
 * Records each gitlink in `<workingFolder>/.git/index` (and its shared index,
 * when the index is split) and what its `.git` is. Nothing is recorded when
 * `.git` is not a real folder (a linked worktree or a submodule) or has no index.
 *
 * @throws when the index can't be read, since its gitlinks can't be checked then.
 */
export async function snapshotNestedGit(workingFolder: string): Promise<NestedGitSnapshot | null> {
  const paths = await gitlinks(workingFolder).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `can't read the git index in ${workingFolder} (${reason}), so its submodules can't be ` +
        "checked at session end. Run `git status` there to check the index, then open the session again.",
    );
  });
  if (paths === null) return null;
  const dotGits = new Map<string, DotGit>();
  for (const path of paths) dotGits.set(path, await describe(workingFolder, path));
  return { workingFolder, dotGits };
}

/**
 * Moves aside the `.git` of each gitlink the program added to the index, or
 * whose `.git` it made or changed. `git status` in the working folder looks
 * into every gitlink with a `.git` and reads that repository's settings, so a
 * repository the program made could run a command (`core.fsmonitor`) on the
 * user's next `git status`. Moved aside to `.git.halonic-blocked`, nothing of
 * the program's work is lost, and the folder is a plain folder to git.
 *
 * This covers a submodule that is not checked out at session start too: its
 * `.git` can't be denied (git refuses the empty file the fence would put
 * there), so one the program writes is undone here. The gitlinks recorded at
 * start count even when the program took them out of the index or broke it,
 * since restoring the index would bring them back.
 *
 * @returns the `.git` paths it moved aside and those it could not (or the
 *   index, when it can't be read), relative to the working folder.
 */
export async function undoNestedGit(
  snapshot: NestedGitSnapshot,
): Promise<{ undone: string[]; failed: string[] }> {
  const undone: string[] = [];
  const failed: string[] = [];
  const now = await gitlinks(snapshot.workingFolder).catch(() => null);
  // An index this reader can't read any more is itself a change it can't vouch for.
  if (now === null) failed.push(join(".git", "index"));
  const paths = new Set([...snapshot.dotGits.keys(), ...(now ?? [])]);
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

async function gitlinks(workingFolder: string): Promise<string[] | null> {
  const gitFolder = join(workingFolder, ".git");
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
