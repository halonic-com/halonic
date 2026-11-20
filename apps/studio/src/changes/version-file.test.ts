import { spawnSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { filesChangedSince, readFileAtVersion } from "./version-file.ts";

const identity = ["-c", "user.name=T", "-c", "user.email=t@example.com"];

/** Runs real git in `dir`; the answer is what the shell would give. */
const realGit = (dir: string) => async (args: readonly string[]) => {
  const run = spawnSync("git", [...identity, ...args], { cwd: dir, encoding: "utf8" });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
};

/** Writes `text` to `path`, records it as a new version and gives the version's id. */
function commit(dir: string, path: string, text: string): string {
  writeFileSync(join(dir, path), text);
  spawnSync("git", ["add", path], { cwd: dir });
  spawnSync("git", [...identity, "commit", "--quiet", "-m", path], { cwd: dir });
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

const reason = (answer: { readonly stderr: string }) => answer.stderr.trim();

/** A folder with history: `a.txt` as "one", then as "two", then `b.txt` added. */
function withVersions(run: (dir: string, ids: readonly string[]) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "version-file-"));
    try {
      spawnSync("git", ["init", "--quiet", dir]);
      const ids = [
        commit(dir, "a.txt", "one\n"),
        commit(dir, "a.txt", "two\n"),
        commit(dir, "b.txt", "bee\n"),
      ];
      await run(dir, ids);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

verifies("source-control.history-restore", () => {
  describe("readFileAtVersion", () => {
    it(
      "reads a file as each version has it",
      withVersions(async (dir, [first, second]) => {
        expect(await readFileAtVersion(realGit(dir), reason, first ?? "", "a.txt")).toBe("one\n");
        expect(await readFileAtVersion(realGit(dir), reason, second ?? "", "a.txt")).toBe("two\n");
      }),
    );

    it(
      "gives null for a file the version doesn't have",
      withVersions(async (dir, [first]) => {
        expect(await readFileAtVersion(realGit(dir), reason, first ?? "", "b.txt")).toBeNull();
      }),
    );

    it(
      "throws for a version that isn't there, or an id that isn't a version's",
      withVersions(async (dir) => {
        await expect(
          readFileAtVersion(realGit(dir), reason, "0".repeat(40), "a.txt"),
        ).rejects.toThrow();
        await expect(
          readFileAtVersion(realGit(dir), reason, "--output=x", "a.txt"),
        ).rejects.toThrow("its id isn't a version's");
      }),
    );
  });
});

verifies("source-control.history-go-back", () => {
  describe("filesChangedSince", () => {
    const keepAll = () => true;

    it(
      "lists the files that differ from the version: changed, added since and deleted",
      withVersions(async (dir, [first]) => {
        writeFileSync(join(dir, "a.txt"), "three\n");
        const changed = await filesChangedSince(realGit(dir), reason, first ?? "", keepAll);
        expect([...changed].sort()).toEqual(["a.txt", "b.txt"]);
      }),
    );

    it(
      "gives both paths of a renamed file, and leaves out files keep refuses",
      withVersions(async (dir, [, , third]) => {
        renameSync(join(dir, "b.txt"), join(dir, "c.txt"));
        spawnSync("git", ["add", "-A"], { cwd: dir });
        spawnSync("git", [...identity, "commit", "--quiet", "-m", "rename"], { cwd: dir });
        const changed = await filesChangedSince(realGit(dir), reason, third ?? "", keepAll);
        expect([...changed].sort()).toEqual(["b.txt", "c.txt"]);
        const kept = await filesChangedSince(
          realGit(dir),
          reason,
          third ?? "",
          (path) => path !== "c.txt",
        );
        expect(kept).toEqual(["b.txt"]);
      }),
    );

    it(
      "leaves out a file git doesn't know yet, and lists it once a version holds it",
      withVersions(async (dir, [, , third]) => {
        writeFileSync(join(dir, "new.txt"), "new\n");
        expect(await filesChangedSince(realGit(dir), reason, third ?? "", keepAll)).toEqual([]);
        spawnSync("git", ["add", "new.txt"], { cwd: dir });
        spawnSync("git", [...identity, "commit", "--quiet", "-m", "keep"], { cwd: dir });
        expect(await filesChangedSince(realGit(dir), reason, third ?? "", keepAll)).toEqual([
          "new.txt",
        ]);
      }),
    );

    it(
      "gives none when the folder is as the version has it",
      withVersions(async (dir, [, , third]) => {
        expect(await filesChangedSince(realGit(dir), reason, third ?? "", keepAll)).toEqual([]);
      }),
    );

    it(
      "throws for a version that isn't there, or an id that isn't a version's",
      withVersions(async (dir) => {
        await expect(
          filesChangedSince(realGit(dir), reason, "0".repeat(40), keepAll),
        ).rejects.toThrow();
        await expect(filesChangedSince(realGit(dir), reason, "HEAD", keepAll)).rejects.toThrow(
          "its id isn't a version's",
        );
      }),
    );
  });
});
