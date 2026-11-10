import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitPathsToDeny } from "./git-deny-paths.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "srt-git-deny-"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Makes a git folder the way git lays one out: a `HEAD` file is what marks it. */
async function gitFolder(relative: string): Promise<void> {
  await mkdir(join(work, relative), { recursive: true });
  await writeFile(join(work, relative, "HEAD"), "ref: refs/heads/main\n");
}

verifies("sandbox-srt.profile-to-srt-config", () => {
  describe("the git files the fence also denies", () => {
    it("are none when the working folder has no git folder", async () => {
      expect(await gitPathsToDeny(work)).toEqual([]);
    });

    it("are the .git file itself when the working folder is a linked worktree", async () => {
      await writeFile(join(work, ".git"), "gitdir: /elsewhere/.git/worktrees/acme\n");
      expect(await gitPathsToDeny(work)).toEqual([".git"]);
    });

    it("hold the repository's config.worktree, there or not", async () => {
      await gitFolder(".git");
      expect(await gitPathsToDeny(work)).toEqual([join(".git", "config.worktree")]);
    });

    it("hold each linked worktree's config.worktree", async () => {
      await gitFolder(".git");
      await mkdir(join(work, ".git", "worktrees", "feature"), { recursive: true });
      expect(await gitPathsToDeny(work)).toContain(
        join(".git", "worktrees", "feature", "config.worktree"),
      );
    });

    it("hold each submodule's config, config.worktree and hooks, nested ones and names with slashes too", async () => {
      await gitFolder(".git");
      await gitFolder(join(".git", "modules", "docs"));
      await gitFolder(join(".git", "modules", "libs", "acme"));
      await gitFolder(join(".git", "modules", "docs", "modules", "theme"));
      const paths = await gitPathsToDeny(work);
      for (const module of [
        join(".git", "modules", "docs"),
        join(".git", "modules", "libs", "acme"),
        join(".git", "modules", "docs", "modules", "theme"),
      ]) {
        expect(paths).toContain(join(module, "config"));
        expect(paths).toContain(join(module, "config.worktree"));
        expect(paths).toContain(join(module, "hooks"));
      }
      expect(paths).not.toContain(join(".git", "modules", "libs", "config"));
    });

    it("never follow a link the program put in place of a folder", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-git-deny-outside-"));
      try {
        await gitFolder(".git");
        await mkdir(join(outside, "evil"), { recursive: true });
        await writeFile(join(outside, "evil", "HEAD"), "ref: refs/heads/main\n");
        await symlink(outside, join(work, ".git", "modules"));
        await symlink(outside, join(work, ".git", "worktrees"));
        expect(await gitPathsToDeny(work)).toEqual([join(".git", "config.worktree")]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });
});
