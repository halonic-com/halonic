import { lstat, readlink, realpath } from "node:fs/promises";
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
  const target = await insidePath(
    workingFolder,
    resolve(workingFolder, checkout, await readlink(link)),
  );
  if (target !== "" && (await insideWithoutLinks(workingFolder, target, { mustExist: true })))
    return target;
  throw new Error(
    `the .git in ${join(workingFolder, checkout)} is a link that doesn't lead to a git folder inside ` +
      "the working folder, so the sandbox can't keep a program from changing its settings. Replace " +
      "the link with a `gitdir:` file, then open the session again.",
  );
}

/**
 * The absolute `path` relative to the working folder, also when it names the
 * working folder through its real path (`/private/tmp/…` for `/tmp/…` on
 * macOS), as an absolute link git wrote may do. Leaves it when it is
 * outside either way.
 */
export async function insidePath(workingFolder: string, path: string): Promise<string> {
  const direct = relative(workingFolder, path);
  if (!leaves(direct)) return direct;
  const real = relative(await realpath(workingFolder), path);
  return leaves(real) ? direct : real;
}

/**
 * Whether `path`, relative to the working folder, stays inside it with no
 * link on the way: each part of it that is there is a real folder. With
 * `mustExist`, each part must be there too.
 */
export async function insideWithoutLinks(
  workingFolder: string,
  path: string,
  { mustExist = false } = {},
): Promise<boolean> {
  const clean = normalize(path);
  if (leaves(clean)) return false;
  let current = workingFolder;
  for (const part of clean.split(sep)) {
    current = join(current, part);
    const stat = await lstat(current).catch(() => null);
    if (stat === null) return !mustExist;
    if (!stat.isDirectory()) return false;
  }
  return true;
}

function leaves(path: string): boolean {
  return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`);
}
