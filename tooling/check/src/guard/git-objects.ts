import { execFileSync } from "node:child_process";
import type { GitObjects } from "./signatures.ts";

const commitPattern = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Reads commits from the git repo at `root` through git's object commands
 * only: no checkout, no hooks, no filters, so nothing of the pull request
 * runs. Takes full commit IDs only, so no argument reads as an option.
 */
export function gitObjects(root: string): GitObjects {
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const at = (commit: string, path: string): string => {
    if (!commitPattern.test(commit)) {
      throw new Error(`Not a full commit ID: ${commit}`);
    }
    return `${commit}:${path}`;
  };
  const optional = (read: () => string): string | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  return {
    hasCommit: (commit) =>
      commitPattern.test(commit) &&
      optional(() => git("cat-file", "-e", `${commit}^{commit}`)) !== undefined,
    objectId: (commit, path) =>
      optional(() => git("rev-parse", "--verify", "--quiet", at(commit, path)).trim()),
    listFiles: (commit) =>
      git("ls-tree", "-r", "--name-only", "-z", at(commit, "")).split("\0").filter(Boolean),
    readFile: (commit, path) => optional(() => git("cat-file", "blob", at(commit, path))),
  };
}
