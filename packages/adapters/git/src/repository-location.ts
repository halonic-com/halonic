import { readFile, realpath } from "node:fs/promises";
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
export async function checkLocated(top: string, gitDir: string, stdout: string): Promise<void> {
  const [shownTop, shownGitDir, shownCommonDir] = stdout.split("\n").map((line) => line.trimEnd());
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
