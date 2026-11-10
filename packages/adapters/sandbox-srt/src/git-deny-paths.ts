import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { linkedGitFolder } from "./git-link.ts";

/**
 * How deep the search goes before it stops. It counts a level for each folder
 * it enters under `.git/modules` (`.git/modules/libs/acme` is two, its nested
 * `modules/theme` two more), and a level for each submodule checkout inside
 * another one (`docs/theme` is two).
 */
const maxModuleDepth = 8;

/**
 * Files in the working folder that git reads as settings or runs, beyond the
 * fixed `.git/hooks` and `.git/config`, as paths relative to the working
 * folder. Each one can make git run a command on the user's next `git status`
 * (`core.fsmonitor`), so the fence must not let the program write it.
 *
 * - `.git` itself when it is a file (a linked worktree or a submodule): it
 *   points git at another git folder, which the program could make its own.
 * - The `.git` of each submodule checkout listed in `.gitmodules`, nested ones
 *   too: `git status` in the repository runs it in each submodule. When it is a
 *   folder rather than a file, its `config` and `hooks` as well. When it is a
 *   link, those of the git folder it leads to instead (see `linkedGitFolder`),
 *   and the session-end check moves the link aside if the program changes it.
 * - `config.worktree` of the repository and of each linked worktree: git reads
 *   it once `extensions.worktreeConfig` is on (`git sparse-checkout` turns it on).
 * - `config`, `config.worktree` and `hooks` of each submodule under
 *   `.git/modules`.
 * - Each `commondir` there is: it sends git to another folder for its settings.
 *
 * Only what exists at session start is found, and a `.git` or `commondir` only
 * when it is there: on Linux srt puts an empty file at a denied path that is
 * missing while a command runs, and git refuses to work with an empty one. A
 * `commondir` or submodule `.git` the program creates is left to the session-end
 * check. Links are never followed, and the paths in `.gitmodules` are taken
 * only when they stay inside the checkout: the folder is the program's, and the
 * host must not be led out of it.
 *
 * Denying a file locks the folders above it inside the fence: the program can
 * neither rename nor remove `.git/modules/<name>`, `.git/worktrees/<name>` or a
 * submodule checkout, and so `git worktree remove` and `git submodule deinit`
 * fail there.
 */
export async function gitPathsToDeny(workingFolder: string): Promise<string[]> {
  return checkoutPaths(workingFolder, "", 0);
}

/** What to deny for the checkout at `checkout`, relative to `root`, and the submodules in it. */
async function checkoutPaths(root: string, checkout: string, depth: number): Promise<string[]> {
  const dotGit = join(checkout, ".git");
  const kind = await lstat(join(root, dotGit)).catch(() => null);
  if (kind === null) return [];
  const paths: string[] = [];
  if (kind.isFile()) {
    paths.push(dotGit);
  } else if (kind.isDirectory()) {
    if (checkout !== "") paths.push(join(dotGit, "config"), join(dotGit, "hooks"));
    paths.push(...(await gitFolderPaths(root, dotGit)));
  } else if (kind.isSymbolicLink() && checkout !== "") {
    const gitFolder = await linkedGitFolder(root, checkout);
    paths.push(join(gitFolder, "config"), join(gitFolder, "hooks"));
    paths.push(...(await gitFolderPaths(root, gitFolder)));
  } else {
    return [];
  }
  if (depth < maxModuleDepth) {
    for (const path of await submodulePaths(root, checkout)) {
      paths.push(...(await checkoutPaths(root, path, depth + 1)));
    }
  }
  return paths;
}

/** What to deny inside the git folder `gitFolder`, beyond its own `config` and `hooks`. */
async function gitFolderPaths(root: string, gitFolder: string): Promise<string[]> {
  const paths = [
    join(gitFolder, "config.worktree"),
    ...(await ifPresent(root, join(gitFolder, "commondir"))),
  ];
  for (const name of await folders(join(root, gitFolder, "worktrees"))) {
    const worktree = join(gitFolder, "worktrees", name);
    paths.push(
      join(worktree, "config.worktree"),
      ...(await ifPresent(root, join(worktree, "commondir"))),
    );
  }
  for (const module of await moduleFolders(root, join(gitFolder, "modules"), 0)) {
    paths.push(join(module, "config"), join(module, "config.worktree"), join(module, "hooks"));
    paths.push(...(await ifPresent(root, join(module, "commondir"))));
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

/**
 * The submodule checkouts that `.gitmodules` in `checkout` lists, relative to
 * `root`. A path is taken only when it is relative, has no `.` or `..` part and
 * every folder on the way is a real folder, not a link.
 */
async function submodulePaths(root: string, checkout: string): Promise<string[]> {
  const file = join(root, checkout, ".gitmodules");
  if (!(await isFile(file))) return [];
  const found: string[] = [];
  for (const path of listedPaths(await readFile(file, "utf8"))) {
    const parts = path.split("/").filter((part) => part !== "");
    if (path.startsWith("/") || parts.length === 0) continue;
    if (parts.some((part) => part === "." || part === ".." || part.includes("\\"))) continue;
    if (await realFolders(root, checkout, parts)) found.push(join(checkout, ...parts));
  }
  return found;
}

/** The `path` values of the `[submodule …]` sections in a `.gitmodules` file. */
function listedPaths(text: string): string[] {
  const paths: string[] = [];
  let inSubmodule = false;
  for (const line of text.split(/\r?\n/)) {
    const section = /^\s*\[\s*([A-Za-z0-9.-]+)/.exec(line);
    if (section !== null) {
      inSubmodule = section[1]?.toLowerCase() === "submodule";
      continue;
    }
    const entry = /^\s*path\s*=\s*(.*?)\s*$/i.exec(line);
    if (inSubmodule && entry?.[1] !== undefined) paths.push(unquote(entry[1]));
  }
  return paths;
}

/** A git config value without its quotes and comment, and with `\"` and `\\` read. */
function unquote(value: string): string {
  let text = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) text += value[++i];
    else if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "#" || char === ";")) break;
    else text += char;
  }
  return text.trim();
}

/** Whether each of `parts`, from `checkout` down, is a real folder. */
async function realFolders(root: string, checkout: string, parts: string[]): Promise<boolean> {
  let path = join(root, checkout);
  for (const part of parts) {
    path = join(path, part);
    if ((await lstat(path).catch(() => null))?.isDirectory() !== true) return false;
  }
  return true;
}

/** `[path]` when it is there, as a file or a folder (links not followed), else `[]`. */
async function ifPresent(root: string, path: string): Promise<string[]> {
  return (await lstat(join(root, path)).catch(() => null)) === null ? [] : [path];
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
