import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

// Where a repository's git files are: all of them must be inside the
// workspace folder, or a call would work on another repository.

/** git reads alternates five deep; so does the check. */
const maxAlternateDepth = 5;

/** The error for a repository whose git files are outside its folder. */
export function outsideFolder(top: string): Error {
  return new Error(
    `The repository at ${top} keeps its git files outside the folder, which Halonic doesn't allow.`,
  );
}

/** The folder must be the top, with its own `.git` folder as both git folders, not a linked worktree or a `gitdir:` file. */
export async function checkLocated(
  top: string,
  gitDir: string,
  lines: readonly string[],
): Promise<void> {
  const [shownTop, shownGitDir, shownCommonDir] = lines.map((line) => line.trimEnd());
  for (const [shown, expected] of [
    [shownTop, top],
    [shownGitDir, gitDir],
    [shownCommonDir, gitDir],
  ] as const) {
    if (shown === undefined || shown === "" || (await realpath(shown)) !== expected) {
      throw outsideFolder(top);
    }
  }
}

/**
 * The files and folders in the git folder that git reads and writes. Any of
 * them can be a link, which git follows: to another repository's `objects`
 * or `refs`, a call reads and writes there.
 */
export const gitPaths: readonly string[] = [
  "objects",
  "refs",
  "logs",
  "info",
  "index",
  "packed-refs",
];

/** What asks git where each of {@link gitPaths} is, after the rest of a `rev-parse --path-format=absolute`. */
export const gitPathArgs: readonly string[] = gitPaths.flatMap((name) => ["--git-path", name]);

/**
 * Each of {@link gitPaths}, as git names it in `lines`, and each of
 * {@link linksInGitFolder}, must really be in the git folder; a link that
 * stays in it is fine. One that doesn't exist
 * yet is fine too, unless it is a link: git would follow it on creating it.
 *
 * @throws Error when one of them is a link that leads outside the git folder, or nowhere
 */
export async function checkGitPaths(
  top: string,
  gitDir: string,
  lines: readonly string[],
): Promise<void> {
  for (const line of lines) {
    const path = line.trimEnd();
    const real = path === "" ? null : await realGitPath(path);
    if (real === null || !isInside(gitDir, real)) throw outsideFolder(top);
  }
}

/**
 * Every link at the top of the git folder. git writes some files there
 * through `fopen`, which follows a link: `COMMIT_EDITMSG` on `commit`,
 * `FETCH_HEAD` on `pull`. A list of names would miss the next one, so
 * every link counts.
 */
export async function linksInGitFolder(gitDir: string): Promise<string[]> {
  const entries = await readdir(gitDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isSymbolicLink()).map((entry) => join(gitDir, entry.name));
}

/** The real path of `path`, `path` itself when nothing is there, or `null` for a link that leads nowhere. */
async function realGitPath(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await lstat(path);
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return path;
    throw error;
  }
}

/** Every folder an `objects/info/alternates` file names must be inside the workspace, and so must theirs. */
export async function checkAlternates(top: string, objects: string, depth: number): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(join(objects, "info", "alternates"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const line of contents.split("\n").map((each) => each.trimEnd())) {
    if (line === "" || line.startsWith("#")) continue;
    const alternate = await realAlternate(top, resolve(objects, line));
    if (!isInside(top, alternate)) {
      throw new Error(
        `The repository at ${top} reads objects from outside the folder, which Halonic doesn't allow.`,
      );
    }
    if (depth < maxAlternateDepth) await checkAlternates(top, alternate, depth + 1);
  }
}

/**
 * The real path of an alternate objects folder. A missing one is refused:
 * it could be made inside or outside the folder after the check.
 *
 * @throws Error that says which alternate is missing
 */
async function realAlternate(top: string, alternate: string): Promise<string> {
  try {
    return await realpath(alternate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new Error(
      `The repository at ${top} reads objects from ${alternate}, which doesn't exist. Remove that line from .git/objects/info/alternates and try again.`,
      { cause: error },
    );
  }
}

function isInside(folder: string, path: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder === "" || (!fromFolder.startsWith("..") && !isAbsolute(fromFolder));
}

/** What asks git where a nested repository's git folders are; see {@link checkNestedInside}. */
export const locateNestedArgs: readonly string[] = [
  "rev-parse",
  "--path-format=absolute",
  "--git-dir",
  "--git-common-dir",
];

/**
 * A nested repository's git folders, and its alternates, must be inside
 * the workspace. Its `.git` may be a `gitdir:` file, as a submodule's is,
 * so git says where they are: `stdout` is its answer to
 * {@link locateNestedArgs}.
 *
 * @throws Error when one of them is outside `top`
 */
export async function checkNestedInside(
  top: string,
  nested: string,
  stdout: string,
): Promise<void> {
  const folders = stdout.split("\n").filter((line) => line !== "");
  for (const folder of folders) {
    if (!isInside(top, await realpath(folder))) {
      throw new Error(
        `The repository nested at ${nested} keeps its git files outside the workspace, which Halonic doesn't allow.`,
      );
    }
  }
  const commonDir = folders.at(-1);
  if (commonDir !== undefined) await checkAlternates(top, join(commonDir, "objects"), 0);
}
