import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/** How deep submodules may nest before the search stops: `.git/modules/a/modules/b/…`. */
const maxModuleDepth = 8;

/**
 * Files in the working folder's git folder that git reads as settings or runs,
 * beyond the fixed `.git/hooks` and `.git/config`, as paths relative to the
 * working folder. Each one can make git run a command on the user's next
 * `git status` (`core.fsmonitor`), so the fence must not let the program write it.
 *
 * - `.git` itself when it is a file (a linked worktree or a submodule): it
 *   points git at another git folder, which the program could make its own.
 * - `config.worktree` of the repository and of each linked worktree: git reads
 *   it once `extensions.worktreeConfig` is on (`git sparse-checkout` turns it on).
 * - `config`, `config.worktree` and `hooks` of each submodule under
 *   `.git/modules`: `git status` in the repository runs it in each submodule.
 *
 * Only what exists at session start is found. Links are never followed: the
 * folder is the program's, and the host must not be led out of it.
 */
export async function gitPathsToDeny(workingFolder: string): Promise<string[]> {
  const dotGit = await lstat(join(workingFolder, ".git")).catch(() => null);
  if (dotGit === null) return [];
  if (!dotGit.isDirectory()) return [".git"];
  const paths = [join(".git", "config.worktree")];
  for (const name of await folders(join(workingFolder, ".git", "worktrees"))) {
    paths.push(join(".git", "worktrees", name, "config.worktree"));
  }
  const modules = await moduleFolders(workingFolder, join(".git", "modules"), 0);
  for (const module of modules) {
    paths.push(join(module, "config"), join(module, "config.worktree"), join(module, "hooks"));
  }
  return paths;
}

/**
 * The git folders of the submodules under `relative`. A submodule's name may
 * hold slashes (`libs/acme`), so a folder without a `HEAD` is searched further.
 */
async function moduleFolders(root: string, relative: string, depth: number): Promise<string[]> {
  if (depth >= maxModuleDepth) return [];
  const found: string[] = [];
  for (const name of await folders(join(root, relative))) {
    const folder = join(relative, name);
    if (await isFile(join(root, folder, "HEAD"))) {
      found.push(folder, ...(await moduleFolders(root, join(folder, "modules"), depth + 1)));
    } else {
      found.push(...(await moduleFolders(root, folder, depth + 1)));
    }
  }
  return found;
}

/** The real folders (not links) directly in `path`; none when `path` is not a real folder. */
async function folders(path: string): Promise<string[]> {
  if ((await lstat(path).catch(() => null))?.isDirectory() !== true) return [];
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function isFile(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null))?.isFile() === true;
}
