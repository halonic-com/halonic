import { lstat, readlink } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

/**
 * The git folder a submodule checkout's `.git` link leads to, relative to the
 * working folder. Git follows such a link, so `git status` reads that
 * folder's settings and index. It is taken only when it is a real folder
 * inside the working folder with no further link on the way: anywhere else
 * the program could write it (the temp folder, say) or make it, and the
 * checks could not see it. The link itself is never denied: srt denies the
 * folder it leads to, and the submodule's git would break.
 *
 * @throws when the link leads anywhere else, so the session doesn't open.
 */
export async function linkedGitFolder(workingFolder: string, checkout: string): Promise<string> {
  const link = join(workingFolder, checkout, ".git");
  const target = relative(workingFolder, resolve(workingFolder, checkout, await readlink(link)));
  if (await realFolderInside(workingFolder, target)) return target;
  throw new Error(
    `the .git in ${join(workingFolder, checkout)} is a link that doesn't lead to a git folder inside ` +
      "the working folder, so the sandbox can't keep a program from changing its settings. Replace " +
      "the link with a `gitdir:` file, then open the session again.",
  );
}

/** Whether `path` names a real folder inside `workingFolder`, every folder on the way real too. */
async function realFolderInside(workingFolder: string, path: string): Promise<boolean> {
  const clean = normalize(path);
  if (clean === "." || isAbsolute(clean) || clean === ".." || clean.startsWith(`..${sep}`))
    return false;
  let current = workingFolder;
  for (const part of clean.split(sep)) {
    current = join(current, part);
    if ((await lstat(current).catch(() => null))?.isDirectory() !== true) return false;
  }
  return true;
}
