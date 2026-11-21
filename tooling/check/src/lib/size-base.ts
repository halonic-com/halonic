import { execFileSync } from "node:child_process";

// A revision such as `HEAD^1` or a commit hash; never an option such as `--output=…`.
const revisionPattern = /^(?!-)[\w./~^-]+$/;

/**
 * The commit a pull request's file sizes are compared with: `SIZE_BASE`,
 * which CI sets to the main commit a pull request's run is merged onto, and
 * `pnpm check` sets to `origin/main` outside CI. Undefined when it isn't set,
 * as in the merge queue and on `main`, which keep the plain limit.
 *
 * @throws when it is set to something that isn't a revision
 */
export function sizeBase(): string | undefined {
  const base = process.env["SIZE_BASE"]?.trim() ?? "";
  if (base === "") {
    return undefined;
  }
  if (!revisionPattern.test(base)) {
    throw new Error(`SIZE_BASE must be a commit, got "${base}".`);
  }
  return base;
}

/** The number of lines of a text, not counting an empty line after the last newline. */
export function countLines(text: string): number {
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

/** The files the working tree changes since a commit, as repo paths. */
export function filesChangedSince(root: string, base: string): ReadonlySet<string> {
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "--"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(output.split("\0").filter((file) => file !== ""));
}

/** A file's line count at a commit; 0 when the file doesn't exist there. */
export function linesAt(root: string, base: string, file: string): number {
  try {
    const text = execFileSync("git", ["show", `${base}:${file}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return countLines(text);
  } catch {
    return 0;
  }
}
