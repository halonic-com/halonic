import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxBlock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recoverGitFolders } from "./git-folder-check.ts";
import { gitlinkMode, index } from "./git-index.test-helper.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

/**
 * Fails a test that blocks writes with a folder mode when it runs as root,
 * which ignores modes. A skip would pass silently, and its name counts it as
 * a Windows skip (HAL-4500).
 */
function failUnderRoot(): void {
  if (process.getuid?.() === 0) {
    throw new Error(
      "This test can't run as root: root ignores the folder mode it sets. Run the tests as a normal user.",
    );
  }
}

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
      const changed = join(git, "worktrees", "feature", "commondir");
      const deleted = join(git, "worktrees", "other", "commondir");
      await mkdir(join(git, "worktrees", "other"));
      await writeFile(changed, "../..\n");
      await writeFile(deleted, "../..\n");
      const { session, blocks } = await open();
      await writeFile(changed, "../elsewhere\n");
      await rm(deleted);
      await session.close();
      expect(readFileSync(changed, "utf8")).toBe("../..\n");
      expect(readFileSync(deleted, "utf8")).toBe("../..\n");
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
      const linked = join(git, "worktrees", "feature", "commondir");
      await writeFile(linked, "../..\n");
      const { session, blocks } = await open();
      await session.close();
      expect(readFileSync(linked, "utf8")).toBe("../..\n");
      expect(blocks).toEqual([]);
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] still reports the refused write, then rejects close(), when an undo fails",
      async () => {
        failUnderRoot();
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

    it.skipIf(process.platform === "win32")(
      "[platform:win32] touches nothing under a link it could not turn back into a folder",
      async () => {
        failUnderRoot();
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

    // On Windows each test here starts seven real programs: `whoami` and two `icacls` when the
    // session writes its journal, the same three again in `recoverGitFolders`, and a `node` for a
    // dead pid. They take 0.3 to 2 s on a CI runner, but one hit 5.2 s while the other test files
    // started programs too (HAL-4641). The code under test has no wait of its own, and each
    // `whoami` or `icacls` stops after 15 s, so 20 s still fails a real hang.
    describe("after a host crash", { timeout: 20_000 }, () => {
      let journals: string;

      beforeEach(() => {
        journals = join(base, "journals");
      });

      async function openJournaled() {
        const { runner } = fakeRunner();
        return new SrtSandbox(linux, runner, journals).open(makeProfile(base));
      }

      /** Makes the open session look like one whose host process died. */
      function orphan(): string {
        const dead = spawnSync(process.execPath, [
          "-e",
          "process.stdout.write(String(process.pid))",
        ]);
        const file = join(journals, readdirSync(journals)[0] as string);
        const journal = JSON.parse(readFileSync(file, "utf8"));
        writeFileSync(file, JSON.stringify({ ...journal, pid: Number(dead.stdout.toString()) }));
        return file;
      }

      it("undoes a commondir the program planted and removes the journal", async () => {
        const commondir = join(git, "commondir");
        const linked = join(git, "worktrees", "feature", "commondir");
        await writeFile(linked, "../..\n");
        await openJournaled();
        await writeFile(commondir, "../elsewhere\n");
        await writeFile(linked, "../elsewhere\n");
        const file = orphan();
        const result = await recoverGitFolders(journals);
        expect(existsSync(commondir)).toBe(false);
        expect(readFileSync(linked, "utf8")).toBe("../..\n");
        expect(result.undone.sort()).toEqual([commondir, linked].sort());
        expect(result.failed).toEqual([]);
        expect(existsSync(file)).toBe(false);
      });

      it("leaves the session of a live host process alone", async () => {
        const commondir = join(git, "commondir");
        await openJournaled();
        await writeFile(commondir, "../elsewhere\n");
        expect(await recoverGitFolders(journals)).toEqual({ undone: [], failed: [] });
        expect(existsSync(commondir)).toBe(true);
      });

      it("removes the journal when the session closes cleanly", async () => {
        const session = await openJournaled();
        await session.close();
        expect(readdirSync(journals)).toEqual([]);
      });

      it("leaves a planted path outside the git folder alone", async () => {
        await openJournaled();
        const victim = join(base, "victim.txt");
        await writeFile(victim, "keep");
        const file = orphan();
        const journal = JSON.parse(readFileSync(file, "utf8"));
        journal.originals.push([victim, { kind: "absent" }]);
        writeFileSync(file, JSON.stringify(journal));
        expect(await recoverGitFolders(journals)).toEqual({ undone: [], failed: [] });
        expect(readFileSync(victim, "utf8")).toBe("keep");
      });

      it.skipIf(process.platform === "win32")(
        "[platform:win32] skips a journal that others can write",
        async () => {
          const commondir = join(git, "commondir");
          await openJournaled();
          await writeFile(commondir, "../elsewhere\n");
          const file = orphan();
          await chmod(file, 0o666);
          expect(await recoverGitFolders(journals)).toEqual({ undone: [], failed: [] });
          expect(existsSync(commondir)).toBe(true);
        },
      );
    });

    it("does nothing when the working folder has no git folder", async () => {
      await rm(git, { recursive: true });
      const { session, blocks } = await open();
      await session.close();
      expect(blocks).toEqual([]);
    });
  });
});
