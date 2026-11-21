import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { countLines, type PullRequestFiles, pullRequestFiles } from "../lib/pull-request-files.ts";
import { checkFileSize } from "../rules/file-size.ts";
import { removeFixtureRepo, std, writeFixtureRepo } from "./fixture-repo.ts";

const file = "packages/core/std/src/index.ts";

/** File-size errors for a std whose index.ts has `lines` lines, on this pull request. */
function sizeErrors(lines: number, changes: PullRequestFiles | undefined): string[] {
  const pkg = { ...std, files: { "src/index.ts": "export const x = 1;\n".repeat(lines) } };
  const root = writeFixtureRepo([pkg], { coreOrder: ["@halonicjs/std"] });
  try {
    return checkFileSize(loadContext(root), () => changes)
      .problems.filter((problem) => problem.severity === "error")
      .map((problem) => problem.message);
  } finally {
    removeFixtureRepo(root);
  }
}

function changed(linesBefore: number, touched = [file]): PullRequestFiles {
  return { range: "a..b", touched: new Set(touched), linesBefore: () => linesBefore };
}

describe("tooling/check: file-size headroom on pull requests", () => {
  it("fails a file the pull request grows to within 20 lines of the limit", () => {
    const [message] = sizeErrors(485, changed(470));
    expect(message).toContain("485 lines");
    expect(message).toContain("within 20 lines of the 500-line limit (it had 470)");
    expect(message).toContain("to 480 lines or fewer");
    expect(sizeErrors(481, changed(0))).toHaveLength(1);
  });

  it("passes a file at 480 lines, one it doesn't grow, and one it doesn't touch", () => {
    expect(sizeErrors(480, changed(470))).toEqual([]);
    expect(sizeErrors(495, changed(495))).toEqual([]);
    expect(sizeErrors(490, changed(499))).toEqual([]);
    expect(sizeErrors(495, changed(470, ["packages/core/std/src/other.ts"]))).toEqual([]);
  });

  it("keeps the plain 500-line limit without a pull request (merge groups, main)", () => {
    expect(sizeErrors(500, undefined)).toEqual([]);
    expect(sizeErrors(501, undefined)).toEqual([
      "501 lines; the limit is 500. Split it by concept: one file per view, service or helper, named after what it holds.",
    ]);
  });

  it("reports a SIZE_RANGE it can't read", () => {
    const pkg = { ...std, files: { "src/index.ts": "export const x = 1;\n" } };
    const root = writeFixtureRepo([pkg], { coreOrder: ["@halonicjs/std"] });
    try {
      const report = checkFileSize(loadContext(root), () => {
        throw new Error('SIZE_RANGE must be BASE..HEAD, got "x".');
      });
      expect(report.problems.map((problem) => problem.file)).toEqual(["SIZE_RANGE"]);
    } finally {
      removeFixtureRepo(root);
    }
  });
});

describe("tooling/check: the files a pull request changes", () => {
  let root: string;
  let base: string;
  let head: string;
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Ada",
        "-c",
        "user.email=ada@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
  const lines = (count: number): string => "x\n".repeat(count);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "size-range-"));
    git("init", "-q", "-b", "main");
    writeFileSync(join(root, "a.ts"), lines(10));
    writeFileSync(join(root, "b.ts"), lines(5));
    git("add", ".");
    git("commit", "-q", "-m", "base");
    base = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", base);
    git("checkout", "-q", "-b", "topic");
    writeFileSync(join(root, "a.ts"), lines(12));
    writeFileSync(join(root, "c.ts"), lines(3));
    git("add", ".");
    git("commit", "-q", "-m", "topic");
    head = git("rev-parse", "HEAD");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads SIZE_RANGE, with each file's lines at the merge base", () => {
    const files = pullRequestFiles(root, {
      SIZE_RANGE: `${base}..${head}`,
      GITHUB_ACTIONS: "true",
    });
    expect([...(files?.touched ?? [])].sort()).toEqual(["a.ts", "c.ts"]);
    expect(files?.linesBefore("a.ts")).toBe(10);
    expect(files?.linesBefore("c.ts")).toBe(0);
  });

  it("compares the working tree with origin/main in a local run", () => {
    writeFileSync(join(root, "b.ts"), lines(6));
    try {
      const files = pullRequestFiles(root, {});
      expect(files?.range).toBe("origin/main");
      expect([...(files?.touched ?? [])].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
    } finally {
      git("checkout", "--", "b.ts");
    }
  });

  it("has no pull request in CI without SIZE_RANGE, or outside a repo", () => {
    expect(pullRequestFiles(root, { GITHUB_ACTIONS: "true" })).toBeUndefined();
    const plain = mkdtempSync(join(tmpdir(), "size-range-plain-"));
    try {
      expect(pullRequestFiles(plain, {})).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("refuses a SIZE_RANGE that isn't BASE..HEAD", () => {
    expect(() => pullRequestFiles(root, { SIZE_RANGE: "--output=x" })).toThrow(
      'SIZE_RANGE must be BASE..HEAD, got "--output=x".',
    );
  });

  it("counts lines without the empty one after the last newline", () => {
    expect(countLines("")).toBe(1);
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
  });
});
