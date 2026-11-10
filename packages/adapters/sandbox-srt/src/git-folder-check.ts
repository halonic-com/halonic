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
import { join } from "node:path";

/** What one `commondir` file was when the session started: its content, its link target, or nothing. */
type Original =
  | { kind: "file"; data: Buffer; mode: number }
  | { kind: "link"; target: string }
  | { kind: "absent" };

/** The `commondir` files of a working folder's git folder, as they were at session start. */
export interface GitFolderSnapshot {
  readonly gitFolder: string;
  readonly originals: ReadonlyMap<string, Original>;
}

/** Git reads config and hooks from the folder a `commondir` file names, so the program must not change one. */
async function commondirPaths(gitFolder: string): Promise<string[]> {
  const paths = [join(gitFolder, "commondir")];
  const worktrees = join(gitFolder, "worktrees");
  const names = await readdir(worktrees).catch(() => [] as string[]);
  for (const name of names) paths.push(join(worktrees, name, "commondir"));
  return paths;
}

async function read(path: string): Promise<Original> {
  const stat = await lstat(path).catch(() => null);
  if (stat === null) return { kind: "absent" };
  if (stat.isSymbolicLink()) return { kind: "link", target: await readlink(path) };
  if (stat.isFile()) return { kind: "file", data: await readFile(path), mode: stat.mode & 0o777 };
  // A folder or something else where a file belongs: undone like any other change.
  return { kind: "absent" };
}

function same(a: Original, b: Original): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") return a.data.equals(b.data);
  if (a.kind === "link" && b.kind === "link") return a.target === b.target;
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
  for (const path of await commondirPaths(gitFolder)) originals.set(path, await read(path));
  return { gitFolder, originals };
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
  const paths = new Set([
    ...snapshot.originals.keys(),
    ...(await commondirPaths(snapshot.gitFolder)),
  ]);
  for (const path of paths) {
    const original = snapshot.originals.get(path) ?? ({ kind: "absent" } as const);
    try {
      if (same(original, await read(path))) continue;
      await rm(path, { recursive: true, force: true });
      if (original.kind === "file") {
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, original.data, { mode: original.mode });
      } else if (original.kind === "link") {
        await symlink(original.target, path);
      }
      undone.push(path);
    } catch {
      failed.push(path);
    }
  }
  return { undone, failed };
}
