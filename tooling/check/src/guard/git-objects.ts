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
      progress(
        `reading ${paths.length} ${paths.length === 1 ? "file" : "files"} at ${commit.slice(0, 12)}`,
      );
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

/**
 * An object answer: `<id> <type> <size>`. A `<spec> missing` answer can't
 * match, because its first word holds the `:` of the spec and it ends in a
 * word, not a size, however many spaces the path has.
 */
const objectHeader = /^(?:[0-9a-f]{40}|[0-9a-f]{64}) ([a-z]+) (\d+)$/;

/** A spec git can't read as one object, like one read per file skips it. */
const unreadable = / (?:missing|ambiguous)$/;

/** Runs the batch and reads its `<id> <type> <size>` or `<spec> missing` answers in order. */
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
    const answer = readAnswer(run.stdout, at, spec);
    if (answer.text !== undefined) texts.set(path, answer.text);
    at = answer.next;
  }
  if (at !== run.stdout.length) {
    throw new Error("git cat-file --batch gave more answers than asked");
  }
  return texts;
}

/** Reads the answer at `at`: the text if it is a blob, and where the next answer starts. */
function readAnswer(
  stdout: Buffer,
  at: number,
  spec: string,
): { text: string | undefined; next: number } {
  const end = stdout.indexOf(0x0a, at);
  if (end === -1) throw new Error(`git cat-file --batch output ends before ${spec}`);
  const header = stdout.toString("utf8", at, end);
  const object = objectHeader.exec(header);
  if (object === null) {
    if (!unreadable.test(header)) {
      throw new Error(`Unexpected git cat-file output for ${spec}: ${header}`);
    }
    return { text: undefined, next: end + 1 };
  }
  const start = end + 1;
  const size = Number(object[2]);
  if (!Number.isSafeInteger(size) || stdout[start + size] !== 0x0a) {
    throw new Error(`git cat-file --batch output ends inside ${spec}`);
  }
  // Only a blob is a file's text; a submodule's commit is skipped, as one read per file does.
  const text = object[1] === "blob" ? stdout.toString("utf8", start, start + size) : undefined;
  return { text, next: start + size + 1 };
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
