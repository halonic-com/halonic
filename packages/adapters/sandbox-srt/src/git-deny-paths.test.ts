import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitPathsToDeny } from "./git-deny-paths.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readdir: vi.fn(real.readdir) };
});

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

    it("hold each linked worktree's commondir, and a commondir only when it is there", async () => {
      await gitFolder(".git");
      await mkdir(join(work, ".git", "worktrees", "feature"), { recursive: true });
      await writeFile(join(work, ".git", "worktrees", "feature", "commondir"), "../..\n");
      const paths = await gitPathsToDeny(work);
      expect(paths).toContain(join(".git", "worktrees", "feature", "commondir"));
      expect(paths).not.toContain(join(".git", "commondir"));
    });

    it("hold the .git file of each submodule checkout in .gitmodules, nested ones too", async () => {
      await gitFolder(".git");
      await writeFile(
        join(work, ".gitmodules"),
        '[submodule "docs"]\n\tpath = docs\n\turl = ../docs\n[submodule "lib"]\n\tpath = "libs/acme" # vendored\n',
      );
      await mkdir(join(work, "docs", "theme"), { recursive: true });
      await mkdir(join(work, "libs", "acme"), { recursive: true });
      await writeFile(join(work, "docs", ".git"), "gitdir: ../.git/modules/docs\n");
      await writeFile(join(work, "libs", "acme", ".git"), "gitdir: ../../.git/modules/lib\n");
      await writeFile(join(work, "docs", ".gitmodules"), '[submodule "theme"]\n\tpath = theme\n');
      await writeFile(
        join(work, "docs", "theme", ".git"),
        "gitdir: ../../.git/modules/docs/modules/theme\n",
      );
      const paths = await gitPathsToDeny(work);
      expect(paths).toContain(join("docs", ".git"));
      expect(paths).toContain(join("libs", "acme", ".git"));
      expect(paths).toContain(join("docs", "theme", ".git"));
    });

    it("hold the config and hooks of a submodule checkout whose .git is a folder", async () => {
      await gitFolder(".git");
      await writeFile(join(work, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
      await gitFolder(join("docs", ".git"));
      const paths = await gitPathsToDeny(work);
      for (const file of ["config", "hooks", "config.worktree"]) {
        expect(paths).toContain(join("docs", ".git", file));
      }
    });

    it("hold the config and hooks of the git folder a submodule's .git link leads to, not the link", async () => {
      await gitFolder(".git");
      await writeFile(join(work, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
      await gitFolder(join(".store", "docs"));
      await mkdir(join(work, "docs"));
      await symlink(join("..", ".store", "docs"), join(work, "docs", ".git"));
      const paths = await gitPathsToDeny(work);
      for (const file of ["config", "hooks", "config.worktree"]) {
        expect(paths).toContain(join(".store", "docs", file));
      }
      expect(paths).not.toContain(join("docs", ".git"));
    });

    it("follow an absolute .git link that names the working folder through its real path", async () => {
      const aliases = await mkdtemp(join(tmpdir(), "srt-git-deny-alias-"));
      try {
        const alias = join(aliases, "work");
        await symlink(work, alias);
        await gitFolder(".git");
        await writeFile(join(work, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
        await gitFolder(join(".store", "docs"));
        await mkdir(join(work, "docs"));
        await symlink(join(await realpath(work), ".store", "docs"), join(work, "docs", ".git"));
        const paths = await gitPathsToDeny(alias);
        for (const file of ["config", "hooks", "config.worktree"]) {
          expect(paths).toContain(join(".store", "docs", file));
        }
      } finally {
        await rm(aliases, { recursive: true, force: true });
      }
    });

    it("refuse a submodule's .git link that leads outside the working folder", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-git-deny-outside-"));
      try {
        await gitFolder(".git");
        await writeFile(join(work, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
        await mkdir(join(work, "docs"));
        await symlink(outside, join(work, "docs", ".git"));
        await expect(gitPathsToDeny(work)).rejects.toThrow(
          `the .git in ${join(work, "docs")} is a link that doesn't lead to a git folder inside the working folder`,
        );
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("leave out a submodule whose .git is not there, as git breaks on the empty file srt puts there", async () => {
      await gitFolder(".git");
      await writeFile(join(work, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
      await mkdir(join(work, "docs"), { recursive: true });
      expect(await gitPathsToDeny(work)).toEqual([join(".git", "config.worktree")]);
    });

    it("take no .gitmodules path that leaves the checkout or goes through a link", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-git-deny-outside-"));
      try {
        await gitFolder(".git");
        await writeFile(join(outside, ".git"), "gitdir: elsewhere\n");
        await symlink(outside, join(work, "linked"));
        const listed = ["../outside", outside, "linked", "./linked", "a/../linked"];
        await writeFile(
          join(work, ".gitmodules"),
          listed.map((path, i) => `[submodule "m${i}"]\n\tpath = ${path}\n`).join(""),
        );
        expect(await gitPathsToDeny(work)).toEqual([join(".git", "config.worktree")]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("hold the config, config.worktree and hooks of each nested clone no .gitmodules lists, clones in clones too (HAL-5976)", async () => {
      await gitFolder(join("vendor", "acme", ".git"));
      await gitFolder(join("vendor", "acme", "docs", "theme", ".git"));
      await gitFolder(join("vendor", "acme", ".git", "modules", "theme"));
      const paths = await gitPathsToDeny(work);
      for (const clone of [join("vendor", "acme"), join("vendor", "acme", "docs", "theme")]) {
        for (const file of ["config", "config.worktree", "hooks"]) {
          expect(paths).toContain(join(clone, ".git", file));
        }
      }
      expect(paths).toContain(join("vendor", "acme", ".git", "modules", "theme", "hooks"));
      expect(new Set(paths).size).toBe(paths.length);
    });

    it("hold the .git file of a nested clone that is a linked worktree", async () => {
      await mkdir(join(work, "vendor", "acme"), { recursive: true });
      await writeFile(
        join(work, "vendor", "acme", ".git"),
        "gitdir: /elsewhere/.git/worktrees/acme\n",
      );
      expect(await gitPathsToDeny(work)).toEqual([join("vendor", "acme", ".git")]);
    });

    it("look for nested clones neither in node_modules nor through a link", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-git-deny-outside-"));
      try {
        await gitFolder(join("node_modules", "acme", ".git"));
        await mkdir(join(outside, "acme", ".git"), { recursive: true });
        await writeFile(join(outside, "acme", ".git", "HEAD"), "ref: refs/heads/main\n");
        await symlink(outside, join(work, "linked"));
        expect(await gitPathsToDeny(work)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("deny a folder it can't read, as a clone could be inside", async () => {
      await mkdir(join(work, "locked"));
      // A refused read, the same on every platform and as root: chmod 000 is neither.
      const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      const locked = join(work, "locked");
      // The search reads every folder with `withFileTypes`, the only form mocked here.
      const readOrRefuse = (path: string, options: { withFileTypes: true }) =>
        path === locked
          ? Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }))
          : real.readdir(path, options);
      vi.mocked(readdir).mockImplementation(readOrRefuse as typeof readdir);
      try {
        expect(await gitPathsToDeny(work)).toEqual(["locked"]);
      } finally {
        vi.mocked(readdir).mockRestore();
      }
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
