import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneProblems, oldEnvironment } from "./old-repo.ts";
import { TestFolders } from "./test-folders.ts";

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

function git(folder: string, ...args: string[]): string {
  const identity = [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
  ];
  return execFileSync("git", [...identity, "-C", folder, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

/** A one-commit repo, with or without an installed tsx. */
function clone(withTsx: boolean): { folder: string; head: string } {
  const folder = folders.make();
  git(folder, "init", "-q");
  folders.write(folder, { "a.txt": "a\n", ".gitignore": "node_modules\n" });
  if (withTsx) {
    folders.write(folder, { "node_modules/.bin/tsx": "" });
  }
  git(folder, "add", ".");
  git(folder, "commit", "-q", "-m", "one");
  return { folder, head: git(folder, "rev-parse", "HEAD") };
}

describe("parity.record-only-from-reference", () => {
  it("accepts a clean clone at the expected commit with tsx installed", () => {
    const { folder, head } = clone(true);
    expect(cloneProblems(folder, head)).toEqual([]);
  });

  it("refuses another commit, changed files and missing dependencies", () => {
    const { folder } = clone(false);
    folders.write(folder, { "a.txt": "changed\n" });
    const problems = cloneProblems(folder);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/not at the reference 784f78d/);
    expect(problems[1]).toMatch(/changed files/);
    expect(problems[2]).toMatch(/run pnpm install/);
  });

  it("refuses a folder that is no git clone", () => {
    const folder = folders.make();
    expect(cloneProblems(folder)).toEqual([`${folder} is not a git clone`]);
  });

  it("gives the old code an empty home and only the variables that find Node", () => {
    vi.stubEnv("ACME_SECRET", "not for the old code");
    vi.stubEnv("PATH", "/usr/bin");
    vi.stubEnv("LD_LIBRARY_PATH", "/opt/libs");
    expect(oldEnvironment("/empty/home")).toEqual({
      HOME: "/empty/home",
      TZ: "UTC",
      LANG: "C",
      NO_COLOR: "1",
      PATH: "/usr/bin",
      LD_LIBRARY_PATH: "/opt/libs",
    });
    vi.stubEnv("LD_LIBRARY_PATH", undefined);
    expect(Object.keys(oldEnvironment("/h"))).not.toContain("LD_LIBRARY_PATH");
  });
});
