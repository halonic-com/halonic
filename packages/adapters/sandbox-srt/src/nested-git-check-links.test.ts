import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileMode, gitlinkMode, index } from "./git-index.test-helper.ts";
import { snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";

let work: string;

/** `docs` checked out with its `.git` a link, and `theme` in its index only. */
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "srt-nested-git-links-"));
  await writeIndex(["docs"], ".git");
  await writeIndex(["theme"], join(".git", "modules", "docs"));
  await mkdir(join(work, "docs", "theme"), { recursive: true });
  await symlink(join("..", ".git", "modules", "docs"), join(work, "docs", ".git"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function writeIndex(paths: string[], gitFolder: string): Promise<void> {
  const entries = [
    { path: "README.md", mode: fileMode },
    ...paths.map((path) => ({ path, mode: gitlinkMode })),
  ];
  await mkdir(join(work, gitFolder), { recursive: true });
  await writeFile(join(work, gitFolder, "index"), index(entries));
}

/** A nested repository the way a program would plant one: its own settings in `<path>/.git`. */
async function plantRepository(path: string): Promise<void> {
  await mkdir(join(work, path, ".git"), { recursive: true });
  await writeFile(join(work, path, ".git", "config"), "[core]\n\tfsmonitor = touch pwned\n");
}

/** Points `docs/.git` at `target` instead. */
async function relink(target: string): Promise<void> {
  await rm(join(work, "docs", ".git"));
  await symlink(target, join(work, "docs", ".git"));
}

const refusal = (checkout: string) =>
  `the .git in ${join(work, checkout)} is a link that doesn't lead to a git folder inside the working folder`;

verifies("sandbox-srt.session", () => {
  describe("the gitlinks of a submodule whose .git is a link at session start", () => {
    it("moves aside a .git planted in its nested submodule that is not checked out", async () => {
      const snapshot = await snapshotNestedGit(work);
      await plantRepository(join("docs", "theme"));
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [join("docs", "theme", ".git")],
        failed: [],
      });
      expect(existsSync(join(work, "docs", "theme", ".git"))).toBe(false);
      expect((await lstat(join(work, "docs", ".git"))).isSymbolicLink()).toBe(true);
    });

    it("moves aside one planted when the link leads elsewhere in the working folder", async () => {
      await writeIndex(["theme"], join(".store", "docs"));
      await relink(join("..", ".store", "docs"));
      const snapshot = await snapshotNestedGit(work);
      await plantRepository(join("docs", "theme"));
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [join("docs", "theme", ".git")],
        failed: [],
      });
    });

    it("moves the link aside when the program adds a commondir where it leads, outside .git/modules", async () => {
      await writeIndex(["theme"], join(".store", "docs"));
      await relink(join("..", ".store", "docs"));
      const snapshot = await snapshotNestedGit(work);
      await plantRepository("evil");
      await writeFile(join(work, ".store", "docs", "commondir"), "../../evil/.git\n");
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [join("docs", ".git")], failed: [] });
      expect(existsSync(join(work, "docs", ".git"))).toBe(false);
    });

    it("moves the link aside when the program points it at another git folder", async () => {
      const snapshot = await snapshotNestedGit(work);
      await plantRepository("evil");
      await relink(join("..", "evil", ".git"));
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [join("docs", ".git")], failed: [] });
      expect(existsSync(join(work, "docs", ".git"))).toBe(false);
      expect((await lstat(join(work, "docs", ".git.halonic-blocked"))).isSymbolicLink()).toBe(true);
    });

    it("leaves the submodule alone when the program did not touch it", async () => {
      const snapshot = await snapshotNestedGit(work);
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [], failed: [] });
    });

    it("refuses to start when the link leads outside the working folder", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-nested-git-outside-"));
      try {
        await mkdir(join(outside, "docs"));
        await relink(join(outside, "docs"));
        await expect(snapshotNestedGit(work)).rejects.toThrow(refusal("docs"));
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("refuses to start when the link leads to no folder, as the program could make one there", async () => {
      await relink(join("..", ".store", "docs"));
      await expect(snapshotNestedGit(work)).rejects.toThrow(refusal("docs"));
    });

    it("refuses to start when the way to the git folder goes through another link", async () => {
      await symlink(join(work, ".git", "modules"), join(work, ".store"));
      await relink(join("..", ".store", "docs"));
      await expect(snapshotNestedGit(work)).rejects.toThrow(refusal("docs"));
    });
  });
});
