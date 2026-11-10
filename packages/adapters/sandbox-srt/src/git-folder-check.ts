import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
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

type OriginalJson =
  | { kind: "file"; data: string; mode: number }
  | { kind: "link"; target: string }
  | { kind: "other" }
  | { kind: "absent" };

interface Journal {
  pid: number;
  gitFolder: string;
  originals: [string, OriginalJson][];
  folders: string[];
}

const posix = process.platform !== "win32";

/** Whether `stat` is owned by this user and cannot be written by group or others (always true on Windows, which has neither). */
function ownedAndClosed(stat: { uid: number; mode: number }): boolean {
  if (!posix) return true;
  return stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0;
}

/**
 * Makes the folder that keeps the journals: a real folder (never a link) that only
 * this user can write, mode 0700. Throws when one is there that is not safe to use,
 * so a session never keeps a journal where another user could change it.
 */
export async function prepareJournalFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stat = await lstat(folder);
  if (!stat.isDirectory() || !ownedAndClosed(stat)) {
    throw new Error(`the journal folder ${folder} is not a private folder of this user`);
  }
  if (posix) await chmod(folder, 0o700);
}

/**
 * Keeps the snapshot on disk, in the journal folder, so a host crash does not lose it.
 * The folder is not the session's own: the session adds it to the paths the fence hides,
 * so the program cannot change what a recovery restores.
 *
 * @returns the journal's path, for `removeJournal` once the session has closed.
 */
export async function writeJournal(
  journalFolder: string,
  name: string,
  snapshot: GitFolderSnapshot,
  pid = process.pid,
): Promise<string> {
  await prepareJournalFolder(journalFolder);
  const originals = [...snapshot.originals].map(([path, o]): [string, OriginalJson] => [
    path,
    o.kind === "file" ? { kind: "file", data: o.data.toString("base64"), mode: o.mode } : o,
  ]);
  const journal: Journal = {
    pid,
    gitFolder: snapshot.gitFolder,
    originals,
    folders: [...snapshot.folders],
  };
  const path = join(journalFolder, `${name}.json`);
  await writeFile(path, JSON.stringify(journal), { mode: 0o600 });
  return path;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The paths a journal may name: its git folder (absolute, named `.git`), the `commondir`
 * of that folder or of one of its worktrees, and the folders on the way. A journal naming
 * anything else is not one of ours, so recovery must not write or delete through it.
 */
function inScope(journal: Journal): boolean {
  const { gitFolder } = journal;
  if (typeof gitFolder !== "string" || !isAbsolute(gitFolder) || basename(gitFolder) !== ".git") {
    return false;
  }
  const worktrees = join(gitFolder, "worktrees");
  const worktreeFolder = (path: unknown): boolean =>
    typeof path === "string" &&
    path.startsWith(worktrees + sep) &&
    !path.slice(worktrees.length + 1).includes(sep) &&
    basename(path) !== ".." &&
    basename(path) !== ".";
  const commondir = (path: unknown): boolean =>
    typeof path === "string" &&
    basename(path) === "commondir" &&
    (dirname(path) === gitFolder || worktreeFolder(dirname(path)));
  const folder = (path: unknown): boolean =>
    path === gitFolder || path === worktrees || worktreeFolder(path);
  return (
    Number.isInteger(journal.pid) &&
    Array.isArray(journal.originals) &&
    Array.isArray(journal.folders) &&
    journal.originals.every(
      (entry) => Array.isArray(entry) && commondir(entry[0]) && typeof entry[1]?.kind === "string",
    ) &&
    journal.folders.every(folder)
  );
}

/** Reads one journal if it is safe to act on: ours, not a link, not writable by others, and in scope. */
async function readJournal(path: string): Promise<Journal | null> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || !ownedAndClosed(stat)) return null;
    const journal = JSON.parse(await readFile(path, "utf8")) as Journal;
    return inScope(journal) ? journal : null;
  } catch {
    return null;
  }
}

function toSnapshot(journal: Journal): GitFolderSnapshot {
  return {
    gitFolder: journal.gitFolder,
    originals: new Map(
      journal.originals.map(([path, o]) => [
        path,
        o.kind === "file" ? { kind: "file", data: Buffer.from(o.data, "base64"), mode: o.mode } : o,
      ]),
    ),
    folders: new Set(journal.folders),
  };
}

/**
 * Undoes the `commondir` changes of sessions whose host process died before it could
 * close them: for each journal in `journalFolder` whose process is gone, it runs the same
 * link-safe restore as a close, then removes the journal. A journal it cannot restore is
 * left in place.
 *
 * Nothing is read from a journal folder that is a link or is not this user's alone, and a
 * journal that is a link, belongs to someone else, can be written by others, or names
 * a path outside its git folder's `commondir` files is skipped.
 *
 * A pid that another process has reused counts as a live host, so that session is left
 * for a later recovery: the failure is a missed undo, never a wrong one. Two hosts
 * recovering at once is fine: the restore is the same each time, and a journal that is
 * already gone is skipped.
 *
 * @returns the files it undid and the ones it could not undo.
 */
export async function recoverGitFolders(
  journalFolder: string,
): Promise<{ undone: string[]; failed: string[] }> {
  const undone: string[] = [];
  const failed: string[] = [];
  const stat = await lstat(journalFolder).catch(() => null);
  if (stat === null || !stat.isDirectory() || !ownedAndClosed(stat)) return { undone, failed };
  const names = await readdir(journalFolder).catch(() => []);
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const path = join(journalFolder, name);
    const journal = await readJournal(path);
    if (journal === null || journal.pid === process.pid || alive(journal.pid)) continue;
    const result = await restoreGitFolder(toSnapshot(journal));
    undone.push(...result.undone);
    failed.push(...result.failed);
    if (result.failed.length === 0) await rm(path, { force: true });
  }
  return { undone, failed };
}
