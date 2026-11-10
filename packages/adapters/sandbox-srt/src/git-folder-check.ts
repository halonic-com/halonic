import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { submoduleGitFolders } from "./git-deny-paths.ts";

/** What one `commondir` file was when the session started: its content, its link target, or nothing. */
type Original =
  | { kind: "file"; data: Buffer; mode: number }
  | { kind: "link"; target: string }
  | { kind: "other" }
  | { kind: "absent" };

/** The `commondir` files of a working folder's git folder, as they were at session start. */
export interface GitFolderSnapshot {
  readonly gitFolder: string;
  readonly originals: ReadonlyMap<string, Original>;
  /** The git folder, its `worktrees` folder and each worktree folder that were real folders at session start. */
  readonly folders: ReadonlySet<string>;
}

/** Git reads config and hooks from the folder a `commondir` file names, so the program must not change one. */
async function commondirPaths(gitFolder: string): Promise<string[]> {
  const paths = [join(gitFolder, "commondir")];
  const worktrees = join(gitFolder, "worktrees");
  const names = (await isRealFolder(worktrees)) ? await readdir(worktrees).catch(() => []) : [];
  for (const name of names) paths.push(join(worktrees, name, "commondir"));
  // A submodule's git folder reads its settings through a `commondir` too, and
  // `git status` in the repository goes into each submodule.
  for (const module of await submoduleGitFolders(gitFolder)) paths.push(join(module, "commondir"));
  return paths;
}

async function read(path: string): Promise<Original> {
  const stat = await lstat(path).catch(() => null);
  if (stat === null) return { kind: "absent" };
  if (stat.isSymbolicLink()) return { kind: "link", target: await readlink(path) };
  if (stat.isFile()) return { kind: "file", data: await readFile(path), mode: stat.mode & 0o777 };
  // A folder, a FIFO or something else where a file belongs. It has its own kind so
  // it always counts as a change: a FIFO there would hang the next git command.
  return { kind: "other" };
}

function same(a: Original, b: Original): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") return a.data.equals(b.data);
  if (a.kind === "link" && b.kind === "link") return a.target === b.target;
  return true;
}

/** Whether `path` is a real folder, not a link to one. */
async function isRealFolder(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null))?.isDirectory() ?? false;
}

/**
 * Whether every folder from `gitFolder` down to the folder holding `path` is a
 * real folder right now. If not, something above `path` is a link or a file, and
 * anything done to `path` would go through it.
 */
async function parentsAreReal(gitFolder: string, path: string): Promise<boolean> {
  const chain: string[] = [];
  for (let dir = dirname(path); dir.length >= gitFolder.length; dir = dirname(dir)) {
    chain.push(dir);
    if (dir === gitFolder) break;
  }
  if (chain.at(-1) !== gitFolder) return false;
  for (const dir of chain) if (!(await isRealFolder(dir))) return false;
  return true;
}

/**
 * Makes `path` a real folder again if the program swapped it for a link or a
 * file: the link itself is removed (never followed), and the folder is
 * recreated when it existed at session start.
 *
 * @returns true when it had to change `path`.
 */
async function fixFolder(path: string, existed: boolean): Promise<boolean> {
  const stat = await lstat(path).catch(() => null);
  if (stat?.isDirectory()) return false;
  if (stat === null && !existed) return false;
  if (stat !== null) await rm(path, { force: true });
  if (existed) await mkdir(path);
  return true;
}

/**
 * Records every `commondir` file under `<workingFolder>/.git`. Nothing is
 * recorded when `.git` is not a folder: a file there (a linked worktree) or
 * nothing is not what the program could use this way.
 */
export async function snapshotGitFolder(workingFolder: string): Promise<GitFolderSnapshot | null> {
  const gitFolder = join(workingFolder, ".git");
  const stat = await lstat(gitFolder).catch(() => null);
  if (stat === null || !stat.isDirectory()) return null;
  const originals = new Map<string, Original>();
  const folders = new Set([gitFolder]);
  if (await isRealFolder(join(gitFolder, "worktrees"))) folders.add(join(gitFolder, "worktrees"));
  for (const path of await commondirPaths(gitFolder)) {
    originals.set(path, await read(path));
    if (await isRealFolder(dirname(path))) folders.add(dirname(path));
  }
  return { gitFolder, originals, folders };
}

/** Puts one `commondir` file back. Throws, writing nothing, when a folder above it is no longer a real folder. */
async function restoreFile(snapshot: GitFolderSnapshot, path: string): Promise<boolean> {
  const original = snapshot.originals.get(path) ?? ({ kind: "absent" } as const);
  if (!(await parentsAreReal(snapshot.gitFolder, path)))
    throw new Error(`${path} is behind a link`);
  if (same(original, await read(path))) return false;
  await rm(path, { recursive: true, force: true });
  if (original.kind === "file") {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, original.data, { mode: original.mode });
  } else if (original.kind === "link") {
    await symlink(original.target, path);
  }
  return true;
}

/**
 * Puts every `commondir` file back as the snapshot has it: one the program
 * added is deleted, one it changed or deleted is restored.
 *
 * @returns the files it undid or could not undo, for the session to report.
 */
export async function restoreGitFolder(
  snapshot: GitFolderSnapshot,
): Promise<{ undone: string[]; failed: string[] }> {
  const undone: string[] = [];
  const failed: string[] = [];
  // `.git`, `.git/worktrees` and each worktree folder are writable in the fence, so the
  // program may have swapped one for a link to a folder outside the working folder.
  // Fix those first, so nothing below is written or deleted through a link.
  const worktrees = join(snapshot.gitFolder, "worktrees");
  // A folder it could not fix stays a link, so nothing under it is touched: it is reported as failed.
  const fixed = async (path: string): Promise<void> => {
    try {
      if (path !== snapshot.gitFolder && !(await parentsAreReal(snapshot.gitFolder, path))) {
        failed.push(path);
        return;
      }
      if (await fixFolder(path, snapshot.folders.has(path))) undone.push(path);
    } catch {
      failed.push(path);
    }
  };
  await fixed(snapshot.gitFolder);
  if (!(await isRealFolder(snapshot.gitFolder))) {
    for (const path of snapshot.originals.keys()) failed.push(path);
    return { undone, failed: [...new Set(failed)] };
  }
  await fixed(worktrees);
  const current = (await isRealFolder(worktrees)) ? await readdir(worktrees).catch(() => []) : [];
  const known = [...snapshot.folders].filter((f) => dirname(f) === worktrees);
  for (const name of new Set([...known.map((f) => f.slice(worktrees.length + 1)), ...current])) {
    await fixed(join(worktrees, name));
  }
  const paths = new Set([
    ...snapshot.originals.keys(),
    ...(await commondirPaths(snapshot.gitFolder)),
  ]);
  for (const path of paths) {
    try {
      if (await restoreFile(snapshot, path)) undone.push(path);
    } catch {
      failed.push(path);
    }
  }
  // `failed` is reported to the session like `undone`: either way the program touched the file.
  return { undone, failed: [...new Set(failed)] };
}
