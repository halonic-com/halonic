import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxBlock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitlinkMode, index } from "./git-index.test-helper.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

// chmod does not stop writes on Windows, nor for root.
const cannotBlockWrites = process.platform === "win32" || process.getuid?.() === 0;

let base: string;
let git: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-git-test-"));
  git = join(base, "work", ".git");
  await mkdir(join(git, "worktrees", "feature"), { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function open() {
  const { runner } = fakeRunner();
  const session = await new SrtSandbox(linux, runner).open(makeProfile(base));
  const blocks: SandboxBlock[] = [];
  session.onBlocked((block) => blocks.push(block));
  return { session, blocks };
}

verifies("sandbox-srt.session", () => {
  describe("the git folder check at session end", () => {
    it("deletes a commondir the program added, in the git folder and in a linked worktree", async () => {
      const { session, blocks } = await open();
      const planted = [join(git, "commondir"), join(git, "worktrees", "feature", "commondir")];
      for (const path of planted) await writeFile(path, "../elsewhere\n");
      await session.close();
      for (const path of planted) expect(existsSync(path)).toBe(false);
      expect(blocks).toEqual(planted.map((path) => ({ kind: "file", path, access: "write" })));
    });

    it("restores a commondir the program changed or deleted", async () => {
      const main = join(git, "commondir");
      const linked = join(git, "worktrees", "feature", "commondir");
      await writeFile(main, "..\n");
      await writeFile(linked, "../..\n");
      const { session, blocks } = await open();
      await writeFile(main, "../elsewhere\n");
      await rm(linked);
      await session.close();
      expect(readFileSync(main, "utf8")).toBe("..\n");
      expect(readFileSync(linked, "utf8")).toBe("../..\n");
      expect(blocks).toHaveLength(2);
    });

    it("deletes a commondir in a worktree folder the program made", async () => {
      const { session } = await open();
      const made = join(git, "worktrees", "made");
      await mkdir(made);
      await writeFile(join(made, "commondir"), "../elsewhere\n");
      await session.close();
      expect(existsSync(join(made, "commondir"))).toBe(false);
    });

    it("does not follow a worktree folder the program swapped for a link", async () => {
      const outside = join(base, "outside");
      await mkdir(outside);
      await writeFile(join(outside, "commondir"), "keep\n");
      await writeFile(join(git, "worktrees", "feature", "commondir"), "../..\n");
      const { session, blocks } = await open();
      await rm(join(git, "worktrees", "feature"), { recursive: true });
      await symlink(outside, join(git, "worktrees", "feature"));
      await session.close();
      expect(readdirSync(outside)).toEqual(["commondir"]);
      expect(readFileSync(join(outside, "commondir"), "utf8")).toBe("keep\n");
      const folder = join(git, "worktrees", "feature");
      expect(lstatSync(folder).isDirectory()).toBe(true);
      expect(readFileSync(join(folder, "commondir"), "utf8")).toBe("../..\n");
      expect(blocks).toContainEqual({ kind: "file", path: folder, access: "write" });
    });

    it("does not follow the worktrees folder swapped for a link", async () => {
      const outside = join(base, "outside");
      await mkdir(join(outside, "x"), { recursive: true });
      await writeFile(join(outside, "x", "commondir"), "keep\n");
      const { session } = await open();
      await rm(join(git, "worktrees"), { recursive: true });
      await symlink(outside, join(git, "worktrees"));
      await session.close();
      expect(readFileSync(join(outside, "x", "commondir"), "utf8")).toBe("keep\n");
      expect(lstatSync(join(git, "worktrees")).isDirectory()).toBe(true);
    });

    it("deletes a commondir the program added in a submodule's git folder, nested ones too", async () => {
      const modules = [
        join(git, "modules", "libs", "acme"),
        join(git, "modules", "docs", "modules", "theme"),
      ];
      for (const folder of modules) {
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "HEAD"), "ref: refs/heads/main\n");
      }
      await writeFile(join(git, "modules", "docs", "HEAD"), "ref: refs/heads/main\n");
      const { session, blocks } = await open();
      const planted = modules.map((folder) => join(folder, "commondir"));
      for (const path of planted) await writeFile(path, "../../elsewhere\n");
      await session.close();
      for (const path of planted) expect(existsSync(path)).toBe(false);
      expect(blocks).toHaveLength(planted.length);
      for (const path of planted)
        expect(blocks).toContainEqual({ kind: "file", path, access: "write" });
    });

    it("does not follow a submodule's git folder swapped for a link", async () => {
      const outside = join(base, "outside");
      await mkdir(outside);
      await writeFile(join(outside, "HEAD"), "ref: refs/heads/main\n");
      await writeFile(join(outside, "commondir"), "keep\n");
      const module = join(git, "modules", "docs");
      await mkdir(module, { recursive: true });
      await writeFile(join(module, "HEAD"), "ref: refs/heads/main\n");
      await writeFile(join(module, "commondir"), "../..\n");
      const { session } = await open();
      await rm(module, { recursive: true });
      await symlink(outside, module);
      await expect(session.close()).rejects.toThrow(join(module, "commondir"));
      expect(readFileSync(join(outside, "commondir"), "utf8")).toBe("keep\n");
    });

    it("removes a folder named commondir the program planted", async () => {
      const { session, blocks } = await open();
      const planted = join(git, "commondir");
      await mkdir(planted);
      await session.close();
      expect(existsSync(planted)).toBe(false);
      expect(blocks).toEqual([{ kind: "file", path: planted, access: "write" }]);
    });

    it("leaves an unchanged commondir alone and says nothing", async () => {
      const main = join(git, "commondir");
      await writeFile(main, "..\n");
      const { session, blocks } = await open();
      await session.close();
      expect(readFileSync(main, "utf8")).toBe("..\n");
      expect(blocks).toEqual([]);
    });

    it.skipIf(cannotBlockWrites)(
      "[platform:win32] still reports the refused write, then rejects close(), when an undo fails",
      async () => {
        const linked = join(git, "worktrees", "feature");
        const commondir = join(linked, "commondir");
        await writeFile(commondir, "../..\n");
        const { session, blocks } = await open();
        await writeFile(commondir, "../elsewhere\n");
        await chmod(linked, 0o500);
        try {
          await expect(session.close()).rejects.toThrow(commondir);
        } finally {
          await chmod(linked, 0o700);
        }
        expect(blocks).toEqual([{ kind: "file", path: commondir, access: "write" }]);
      },
    );

    it.skipIf(cannotBlockWrites)(
      "[platform:win32] touches nothing under a link it could not turn back into a folder",
      async () => {
        const outside = join(base, "outside");
        await mkdir(outside);
        await writeFile(join(outside, "commondir"), "outside\n");
        const linked = join(git, "worktrees", "feature");
        const commondir = join(linked, "commondir");
        await writeFile(commondir, "../..\n");
        const { session } = await open();
        await rm(linked, { recursive: true });
        await symlink(outside, linked);
        const worktrees = join(git, "worktrees");
        await chmod(worktrees, 0o500);
        try {
          await expect(session.close()).rejects.toThrow(linked);
        } finally {
          await chmod(worktrees, 0o700);
        }
        expect(readFileSync(join(outside, "commondir"), "utf8")).toBe("outside\n");
        expect(lstatSync(linked).isSymbolicLink()).toBe(true);
      },
    );

    it.each([
      ["a .git file", (dotGit: string) => writeFile(dotGit, "gitdir: .\n")],
      ["a .git folder", (dotGit: string) => mkdir(dotGit)],
    ])("moves aside %s planted in a submodule that was not checked out", async (_, plant) => {
      await mkdir(join(base, "work", "docs"));
      await writeFile(join(git, "index"), index([{ path: "docs", mode: gitlinkMode }]));
      const { session, blocks } = await open();
      const dotGit = join(base, "work", "docs", ".git");
      await plant(dotGit);
      await session.close();
      expect(existsSync(dotGit)).toBe(false);
      expect(existsSync(`${dotGit}.halonic-blocked`)).toBe(true);
      expect(blocks).toEqual([{ kind: "file", path: dotGit, access: "write" }]);
    });

    it("does nothing when the working folder has no git folder", async () => {
      await rm(git, { recursive: true });
      const { session, blocks } = await open();
      await session.close();
      expect(blocks).toEqual([]);
    });
  });
});
