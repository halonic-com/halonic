import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, test } from "vitest";
import { gitObjects } from "./git-objects.ts";

const root = mkdtempSync(join(tmpdir(), "git-objects-"));
const git = (...args: string[]): string =>
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  }).trim();
git("init", "--quiet");
mkdirSync(join(root, "src"));
writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
git("add", ".");
git("commit", "--quiet", "--no-verify", "-m", "one");
const commit = git("rev-parse", "HEAD");
afterAll(() => rmSync(root, { recursive: true, force: true }));

verifies("check.guard-signed-notes", () => {
  test("reads files, blob and folder IDs at a commit from git's objects", () => {
    const objects = gitObjects(root);
    expect(objects.hasCommit(commit)).toBe(true);
    expect(objects.listFiles(commit)).toEqual(["src/a.ts"]);
    expect(objects.readFile(commit, "src/a.ts")).toBe("export const a = 1;\n");
    expect(objects.objectId(commit, "src/a.ts")).toBe(git("hash-object", "src/a.ts"));
    expect(objects.objectId(commit, "src")).toBe(git("rev-parse", `${commit}:src`));
    expect(objects.objectId(commit, "missing.ts")).toBeUndefined();
  });

  test("takes only full commit IDs, so no argument reads as an option", () => {
    const objects = gitObjects(root);
    expect(objects.hasCommit("HEAD")).toBe(false);
    expect(objects.hasCommit("f".repeat(40))).toBe(false);
    expect(() => objects.listFiles("--output=x")).toThrow(/full commit ID/);
  });
});
