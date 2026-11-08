import { checkWorkspacePath } from "./paths.ts";

/**
 * Refuses a path the `Vcs` port calls unsafe: one a workspace store refuses,
 * and one with a segment that reaches the repository's own files. A segment
 * counts as `.git` in any case, with trailing dots or spaces (Windows drops
 * them) and as the short name `git~1` (or any `git~N`).
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkVcsPath(path: string): void {
  checkWorkspacePath(path);
  for (const segment of path.split("/")) {
    const name = segment.toLowerCase().replace(/[. ]+$/, "");
    if (name === ".git" || /^git~[0-9]+$/.test(name)) {
      throw new RangeError(
        `Unsafe path ${JSON.stringify(path)}: the repository's own files can't be reached.`,
      );
    }
  }
}

/** Characters `git check-ref-format` refuses anywhere in a name, besides control characters and space. */
const refusedCharacters = new Set(["~", "^", ":", "?", "*", "[", "\\"]);

/** Whether `name` holds a control character, a space or another character git refuses in a ref. */
function hasRefusedCharacter(name: string): boolean {
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || refusedCharacters.has(character)) return true;
  }
  return false;
}

/**
 * Refuses a branch name the `Vcs` port calls invalid: one that starts with
 * `-` (git would read it as an option), `HEAD`, and one that
 * `git check-ref-format --branch` refuses.
 *
 * @throws RangeError naming the branch and what is wrong with it
 */
export function checkBranchName(name: string): void {
  const problem = branchNameProblem(name);
  if (problem !== null) {
    throw new RangeError(`Invalid branch name ${JSON.stringify(name)}: ${problem}.`);
  }
}

function branchNameProblem(name: string): string | null {
  if (name === "" || name === "@" || name === "HEAD") return "it is reserved or empty";
  if (name.startsWith("-")) return "it can't start with -";
  if (hasRefusedCharacter(name)) return "no spaces, control characters or ~^:?*[\\";
  if (name.includes("..") || name.includes("@{")) return 'no ".." or "@{"';
  if (name.endsWith(".")) return 'it can\'t end with "."';
  for (const part of name.split("/")) {
    if (part === "") return "no empty part, leading or trailing /";
    if (part.startsWith(".")) return 'no part can start with "."';
    if (part.endsWith(".lock")) return 'no part can end with ".lock"';
  }
  return null;
}
