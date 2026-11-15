import { execFileSync, spawnSync } from "node:child_process";
import type { GitObjects } from "./signatures.ts";

const commitPattern = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Above execFileSync's 1 MB default, so a large covered file or the repo's
 * tree listing is read in full instead of failing (HAL-1337 follow-up).
 */
const maxOutputBytes = 256 * 1024 * 1024;

const optional = (read: () => string): string | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

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
export function gitObjects(root: string, progress: (line: string) => void = () => {}): GitObjects {
  const git = gitIn(root);
  const at = (commit: string, path: string): string => {
    if (!commitPattern.test(commit)) {
      throw new Error(`Not a full commit ID: ${commit}`);
    }
    return `${commit}:${path}`;
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
    readFiles: (commit, paths) => {
      progress(`reading ${paths.length} ${paths.length === 1 ? "file" : "files"} at ${commit.slice(0, 12)}`);
      return readBatch(
        root,
        paths.map((path) => [path, at(commit, path)] as const),
      );
    },
  };
}

const hasLineBreak = (spec: string): boolean => /[\r\n]/.test(spec);

/**
 * Reads blobs through one `git cat-file --batch` process instead of one per
 * file. A path with a line break can't be a batch line, so it is read alone.
 */
function readBatch(
  root: string,
  entries: readonly (readonly [path: string, spec: string])[],
): ReadonlyMap<string, string> {
  const batched = entries.filter(([, spec]) => !hasLineBreak(spec));
  const texts = batched.length > 0 ? batchTexts(root, batched) : new Map<string, string>();
  for (const [path, spec] of entries.filter(([, each]) => hasLineBreak(each))) {
    const text = optional(() => gitIn(root)("cat-file", "blob", spec));
    if (text !== undefined) texts.set(path, text);
  }
  return texts;
}

/** Runs the batch and reads its `<id> blob <size>` or `<spec> missing` answers in order. */
function batchTexts(
  root: string,
  batched: readonly (readonly [path: string, spec: string])[],
): Map<string, string> {
  const run = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: batched.map(([, spec]) => `${spec}\n`).join(""),
    maxBuffer: maxOutputBytes,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    throw new Error(`git cat-file --batch failed: ${String(run.stderr)}`);
  }
  const texts = new Map<string, string>();
  let at = 0;
  for (const [path, spec] of batched) {
    const end = run.stdout.indexOf(0x0a, at);
    const header = run.stdout.toString("utf8", at, end).split(" ");
    at = end + 1;
    if (header[1] === "blob") {
      const size = Number(header[2]);
      texts.set(path, run.stdout.toString("utf8", at, at + size));
      at += size + 1;
    } else if (header[header.length - 1] !== "missing") {
      throw new Error(`Unexpected git cat-file output for ${spec}: ${header.join(" ")}`);
    }
  }
  return texts;
}

/** The commit `head` branched from on `base`'s history. */
export function mergeBaseOf(root: string, base: string, head: string): string {
  if (!commitPattern.test(base) || !commitPattern.test(head)) {
    throw new Error(`Not full commit IDs: ${base} ${head}`);
  }
  return gitIn(root)("merge-base", base, head).trim();
}

/**
 * The files `head` changes, adds or deletes since its merge base with
 * `base`, by name only: no diff driver or textconv runs.
 */
export function changedFiles(root: string, base: string, head: string): readonly string[] {
  const mergeBase = mergeBaseOf(root, base, head);
  return gitIn(root)(
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
