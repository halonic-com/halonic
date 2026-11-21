import { execFileSync } from "node:child_process";

// Revisions such as `origin/main~2`; never an option such as `--output=…`.
const rangePattern = /^(?!-)[\w./~^-]+\.\.[\w./~^-]+$/;

/** The files a pull request changes, and how long they were before it. */
export interface PullRequestFiles {
  /** What the files were compared with, for messages. */
  readonly range: string;
  /** The files the pull request changes or adds. */
  readonly touched: ReadonlySet<string>;
  /** How many lines a file had where the pull request branched off; 0 for a new file. */
  linesBefore(file: string): number;
}

/** The lines in a file's text, not counting an empty last line after the final newline. */
export function countLines(text: string): number {
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

/**
 * The files the pull request at `root` changes. `SIZE_RANGE`, which CI sets
 * to the pull request's `BASE..HEAD`, names them. Without it, a local run
 * compares the working tree with `origin/main`. In CI without it (a merge
 * group or a push to main) there is no pull request: undefined.
 *
 * @throws when `SIZE_RANGE` isn't `BASE..HEAD`, or git can't read it
 */
export function pullRequestFiles(
  root: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): PullRequestFiles | undefined {
  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const range = env["SIZE_RANGE"]?.trim() ?? "";
  let base: string;
  let head: string | undefined;
  if (range !== "") {
    if (!rangePattern.test(range)) {
      throw new Error(`SIZE_RANGE must be BASE..HEAD, got "${range}".`);
    }
    [base = "", head] = range.split("..");
  } else if (env["GITHUB_ACTIONS"] === "true") {
    return undefined;
  } else {
    base = "origin/main";
    try {
      git("rev-parse", "--verify", "--quiet", "origin/main^{commit}");
      if (git("rev-parse", "--show-cdup").trim() !== "") {
        return undefined;
      }
    } catch {
      // Not the top of a git repo, or no origin/main: nothing to compare with.
      return undefined;
    }
  }
  const mergeBase = git("merge-base", base, head ?? "HEAD").trim();
  // Without a head, git compares with the working tree.
  const diff = git(
    "diff",
    "--name-only",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    "-z",
    mergeBase,
    ...(head === undefined ? [] : [head]),
  );
  return {
    range: range === "" ? "origin/main" : range,
    touched: new Set(diff.split("\0").filter(Boolean)),
    linesBefore(file) {
      try {
        return countLines(git("cat-file", "blob", `${mergeBase}:${file}`));
      } catch {
        return 0;
      }
    },
  };
}
