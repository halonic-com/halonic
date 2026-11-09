import { checkPublicWorkspacePath } from "./paths.ts";

/**
 * Refuses a path the `Vcs` port calls unsafe: every path a workspace store
 * refuses, unsafe or private. A private segment, such as `.git` in any case,
 * with trailing dots or spaces or as the short name `GIT~1`, would reach the
 * repository's own files, Halonic's data or a secrets file.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkVcsPath(path: string): void {
  checkPublicWorkspacePath(path);
}

/** Characters `git check-ref-format` refuses anywhere in a name, besides control characters and space. */
const refusedCharacters = new Set(["~", "^", ":", "?", "*", "[", "\\"]);

/** Whether `name` holds a control character, a space or another character git refuses in a ref. */
function hasRefusedCharacter(name: string): boolean {
  for (let at = 0; at < name.length; at++) {
    const code = name.charCodeAt(at);
    if (code <= 0x20 || code === 0x7f || refusedCharacters.has(name.charAt(at))) return true;
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
