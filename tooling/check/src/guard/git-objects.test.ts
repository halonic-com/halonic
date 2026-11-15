import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, test } from "vitest";
import { changedFiles, gitObjects } from "./git-objects.ts";
import { coveredPaths } from "./signatures.ts";

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

  test("reads many files in one batch, byte for byte as one read per file", () => {
    const { root, git } = repo();
    const odd = "caf\u00e9\n\nno final newline";
    writeFileSync(join(root, "src/odd.txt"), odd);
    writeFileSync(join(root, "src/empty.txt"), "");
    writeFileSync(join(root, "src/spaced name.txt"), "spaced\n");
    for (let i = 0; i < 50; i++)
      writeFileSync(join(root, `src/f${i}.txt`), `file ${i}\n`.repeat(i));
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "many");
    const commit = git("rev-parse", "HEAD");
    const objects = gitObjects(root);
    const paths = [...objects.listFiles(commit), "src/missing.txt"];
    const batch = objects.readFiles(commit, paths);
    expect(batch.has("src/missing.txt")).toBe(false);
    expect(batch.get("src/odd.txt")).toBe(odd);
    expect(batch.get("src/empty.txt")).toBe("");
    for (const path of objects.listFiles(commit)) {
      expect(batch.get(path)).toBe(objects.readFile(commit, path));
    }
  });

  test("covers the same test files, so a note signs the same text as with one read per file", () => {
    const { root, git } = repo();
    writeFileSync(join(root, "src/a.test.ts"), 'verifies("x.y", () => {});\n');
    writeFileSync(join(root, "src/b.test.ts"), "nothing\n");
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "tests");
    const commit = git("rev-parse", "HEAD");
    const batched = gitObjects(root);
    const oneByOne = {
      ...batched,
      readFiles: (at: string, paths: readonly string[]) =>
        new Map(
          paths.flatMap((path) => {
            const text = batched.readFile(at, path);
            return text === undefined ? [] : [[path, text] as [string, string]];
          }),
        ),
    };
    expect(coveredPaths(["x.y"], batched, commit, commit)).toEqual(
      coveredPaths(["x.y"], oneByOne, commit, commit),
    );
    expect(coveredPaths(["x.y"], batched, commit, commit)).toContain("src/a.test.ts");
  });

  test("says how many files it reads", () => {
    const { root, commit } = repo();
    const lines: string[] = [];
    gitObjects(root, (line) => lines.push(line)).readFiles(commit, ["src/a.ts"]);
    expect(lines).toEqual([`reading 1 files at ${commit.slice(0, 12)}`]);
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
