import { lstat, readFile, rename } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { gitlinkPaths } from "./git-index.ts";

/** What a gitlink's `.git` was at session start: absent, a folder, a link or a file and its text. */
type DotGit = string;

/** The nested repositories of a working folder's index, as they were at session start. */
export interface NestedGitSnapshot {
  readonly workingFolder: string;
  readonly dotGits: ReadonlyMap<string, DotGit>;
}

/**
 * Records each gitlink in `<workingFolder>/.git/index` and what its `.git` is.
 * Nothing is recorded when `.git` is not a real folder or has no index.
 */
export async function snapshotNestedGit(workingFolder: string): Promise<NestedGitSnapshot | null> {
  const paths = await gitlinks(workingFolder);
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
 * @returns the gitlink paths it moved aside and those it could not, relative to the working folder.
 */
export async function undoNestedGit(
  snapshot: NestedGitSnapshot,
): Promise<{ undone: string[]; failed: string[] }> {
  const undone: string[] = [];
  const failed: string[] = [];
  const paths = await gitlinks(snapshot.workingFolder).catch(() => null);
  // An index this reader can't read any more is itself a change it can't vouch for.
  if (paths === null) return { undone, failed: [join(".git", "index")] };
  for (const path of paths) {
    const now = await describe(snapshot.workingFolder, path);
    if (now === "absent" || now === snapshot.dotGits.get(path)) continue;
    try {
      if (!(await insideWithoutLinks(snapshot.workingFolder, path))) throw new Error("unsafe path");
      const dotGit = join(snapshot.workingFolder, path, ".git");
      await rename(dotGit, await freeName(`${dotGit}.halonic-blocked`));
      undone.push(path);
    } catch {
      failed.push(path);
    }
  }
  return { undone, failed };
}

async function gitlinks(workingFolder: string): Promise<string[] | null> {
  const gitFolder = join(workingFolder, ".git");
  if ((await lstat(gitFolder).catch(() => null))?.isDirectory() !== true) return null;
  const index = await readFile(join(gitFolder, "index")).catch(() => null);
  if (index === null) return [];
  const config = await readFile(join(gitFolder, "config"), "utf8").catch(() => "");
  const hashLength = /^\s*objectformat\s*=\s*sha256\s*$/im.test(config) ? 32 : 20;
  return gitlinkPaths(index, hashLength);
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
