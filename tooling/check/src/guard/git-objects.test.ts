import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, test } from "vitest";
import { changedFiles, gitObjects } from "./git-objects.ts";

// Each repo is its own, so tests don't depend on each other when the preset shuffles their order.
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const repo = () => {
  const root = mkdtempSync(join(tmpdir(), "git-objects-"));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
  const blob = git("hash-object", "src/a.ts");
  git("add", ".");
  git("commit", "--quiet", "--no-verify", "-m", "one");
  return { root, git, blob, commit: git("rev-parse", "HEAD") };
};

verifies("check.guard-signed-notes", () => {
  test("reads files, blob and folder IDs at a commit from git's objects", () => {
    const { root, git, blob, commit } = repo();
    const objects = gitObjects(root);
    expect(objects.hasCommit(commit)).toBe(true);
    expect(objects.listFiles(commit)).toEqual(["src/a.ts"]);
    expect(objects.readFile(commit, "src/a.ts")).toBe("export const a = 1;\n");
    expect(objects.objectId(commit, "src/a.ts")).toBe(blob);
    expect(objects.objectId(commit, "src")).toBe(git("rev-parse", `${commit}:src`));
    expect(objects.objectId(commit, "missing.ts")).toBeUndefined();
  });

  test("reads a file larger than execFileSync's default 1 MB buffer", () => {
    const { root, git } = repo();
    const large = `${"x".repeat(2 * 1024 * 1024)}\n`;
    writeFileSync(join(root, "src/large.txt"), large);
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "large");
    expect(gitObjects(root).readFile(git("rev-parse", "HEAD"), "src/large.txt")).toBe(large);
  });

  test("takes only full commit IDs, so no argument reads as an option", () => {
    const objects = gitObjects(repo().root);
    expect(objects.hasCommit("HEAD")).toBe(false);
    expect(objects.hasCommit("f".repeat(40))).toBe(false);
    expect(() => objects.listFiles("--output=x")).toThrow(/full commit ID/);
  });

  test("lists the files a later commit changes, adds or deletes since the merge base", () => {
    const { root, git, commit } = repo();
    writeFileSync(join(root, "src/b.ts"), "export const b = 2;\n");
    rmSync(join(root, "src/a.ts"));
    git("add", "--all");
    git("commit", "--quiet", "--no-verify", "-m", "two");
    expect(changedFiles(root, commit, git("rev-parse", "HEAD"))).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
