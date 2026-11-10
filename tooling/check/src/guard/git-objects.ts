import { execFileSync } from "node:child_process";
import type { GitObjects } from "./signatures.ts";

const commitPattern = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Above execFileSync's 1 MB default, so a large covered file or the repo's
 * tree listing is read in full instead of failing (HAL-1337 follow-up).
 */
const maxOutputBytes = 256 * 1024 * 1024;

const gitIn =
  (root: string) =>
  (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: maxOutputBytes,
      stdio: ["ignore", "pipe", "pipe"],
    });

/**
 * Reads commits from the git repo at `root` through git's object commands
 * only: no checkout, no hooks, no filters, so nothing of the pull request
 * runs. Takes full commit IDs only, so no argument reads as an option.
 */
export function gitObjects(root: string): GitObjects {
  const git = gitIn(root);
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

/**
 * The files `head` changes, adds or deletes since its merge base with
 * `base`, by name only: no diff driver or textconv runs.
 */
export function changedFiles(root: string, base: string, head: string): readonly string[] {
  if (!commitPattern.test(base) || !commitPattern.test(head)) {
    throw new Error(`Not full commit IDs: ${base} ${head}`);
  }
  const git = gitIn(root);
  const mergeBase = git("merge-base", base, head).trim();
  return git(
    "diff",
    "--name-only",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    "-z",
    mergeBase,
    head,
  )
    .split("\0")
    .filter(Boolean);
}
