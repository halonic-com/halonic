import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { checkPublicWorkspacePath } from "@halonicjs/ports";

/**
 * Refuses every path the `Vcs` port calls unsafe, before anything runs: the
 * paths a workspace store refuses, unsafe or private (`.git` in any case and
 * spelling among them), and a path whose folders go through a symbolic link,
 * such as `link/config` with `link -> .git`, which the name rules can't see.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export async function checkVcsPaths(top: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) checkPublicWorkspacePath(path);
  for (const path of paths) await checkNoLinkedFolder(top, path);
}

/**
 * Refuses a path that is a folder on disk. Git takes a folder as everything
 * inside it, so `stage(["sub"])` would stage a private `sub/.env` and
 * `discard(["sub"])` would delete one, though the name check only saw `sub`.
 * Run it after {@link checkVcsPaths}, so the path can't go through a link.
 *
 * @throws RangeError naming the path
 */
export async function checkNoFolders(top: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    if (await isFolder(join(top, path))) {
      throw new RangeError(
        `Unsafe path ${JSON.stringify(path)}: it is a folder, so git would take every file inside it. Name the files instead.`,
      );
    }
  }
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

async function checkNoLinkedFolder(top: string, path: string): Promise<void> {
  const folders = path.split("/").slice(0, -1);
  let current = top;
  for (const folder of folders) {
    current = join(current, folder);
    const kind = await kindOf(current);
    // A folder that isn't there yet can't lead anywhere else.
    if (kind === "missing") return;
    if (kind === "link") {
      throw new RangeError(
        `Unsafe path ${JSON.stringify(path)}: ${JSON.stringify(folder)} is a link, which git could follow out of the folder.`,
      );
    }
  }
}

async function kindOf(path: string): Promise<"missing" | "link" | "other"> {
  try {
    return (await lstat(path)).isSymbolicLink() ? "link" : "other";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    throw error;
  }
}

/**
 * Refuses a branch name before git sees it: one git would read as an option
 * (it starts with `-`), `HEAD`, `@` or any name with `@{`, which git expands
 * (`@{-1}` is the previous branch), and a control character, which can't
 * reach git as an argument. `git check-ref-format --branch` checks the rest.
 *
 * @throws RangeError naming the branch and what is wrong with it
 */
export function checkBranchNameShape(name: string): void {
  const problem = branchNameProblem(name);
  if (problem !== null) {
    throw new RangeError(`Invalid branch name ${JSON.stringify(name)}: ${problem}.`);
  }
}

function branchNameProblem(name: string): string | null {
  if (name === "" || name === "@" || name === "HEAD") return "it is reserved or empty";
  if (name.startsWith("-")) return "it can't start with -";
  if (name.includes("@{")) return 'it can\'t hold "@{"';
  for (let at = 0; at < name.length; at++) {
    const code = name.charCodeAt(at);
    if (code < 0x20 || code === 0x7f) return "it can't hold a control character";
  }
  return null;
}
