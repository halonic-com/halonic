import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;
let work: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-commondir-test-"));
  work = join(base, "work");
  await mkdir(join(work, ".git", "worktrees", "feature"), { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function open() {
  const { runner } = fakeRunner();
  return new SrtSandbox(linux, runner).open(makeProfile(base));
}

verifies("sandbox-srt.session", () => {
  describe("the commondir check at session start", () => {
    it("opens on a main git folder with no commondir and a linked worktree that says ../..", async () => {
      await writeFile(join(work, ".git", "worktrees", "feature", "commondir"), "../..\n");
      await expect((await open()).close()).resolves.toBeUndefined();
    });

    it("opens on a working folder with no git folder", async () => {
      await rm(join(work, ".git"), { recursive: true });
      await expect((await open()).close()).resolves.toBeUndefined();
    });

    it("refuses a main git folder that has a commondir", async () => {
      const planted = join(work, ".git", "commondir");
      await writeFile(planted, "../elsewhere\n");
      await expect(open()).rejects.toThrow(planted);
    });

    it("refuses a linked worktree's folder whose commondir says anything but ../..", async () => {
      const planted = join(work, ".git", "worktrees", "feature", "commondir");
      await writeFile(planted, "../../elsewhere\n");
      await expect(open()).rejects.toThrow(planted);
    });

    it("refuses a commondir that is a link or a folder", async () => {
      const planted = join(work, ".git", "worktrees", "feature", "commondir");
      await symlink("../..", planted);
      await expect(open()).rejects.toThrow(planted);
      await rm(planted);
      await mkdir(planted);
      await expect(open()).rejects.toThrow(planted);
    });

    it("refuses a submodule's git folder that has a commondir", async () => {
      const module = join(work, ".git", "modules", "docs");
      await mkdir(module, { recursive: true });
      await writeFile(join(module, "HEAD"), "ref: refs/heads/main\n");
      await writeFile(join(module, "commondir"), "../..\n");
      await expect(open()).rejects.toThrow(join(module, "commondir"));
    });

    it("checks the git folder a linked worktree's .git file leads to", async () => {
      await rm(join(work, ".git"), { recursive: true });
      const gitdir = join(base, "main", ".git", "worktrees", "work");
      await mkdir(gitdir, { recursive: true });
      await writeFile(join(work, ".git"), `gitdir: ${gitdir}\n`);
      await writeFile(join(gitdir, "commondir"), "../..\n");
      await expect((await open()).close()).resolves.toBeUndefined();
      await writeFile(join(gitdir, "commondir"), "../../../x\n");
      await expect(open()).rejects.toThrow(join(gitdir, "commondir"));
    });

    it("accepts no commondir, not ../.., in the git folder a submodule's .git file leads to", async () => {
      await rm(join(work, ".git"), { recursive: true });
      const gitdir = join(base, "main", ".git", "modules", "docs");
      await mkdir(gitdir, { recursive: true });
      await writeFile(join(work, ".git"), `gitdir: ${gitdir}\n`);
      await expect((await open()).close()).resolves.toBeUndefined();
      await writeFile(join(gitdir, "commondir"), "../..\n");
      await expect(open()).rejects.toThrow(join(gitdir, "commondir"));
    });

    it("accepts ../.. in a linked worktree of a submodule, whose git folder is in .git/modules/<m>/worktrees", async () => {
      await rm(join(work, ".git"), { recursive: true });
      const gitdir = join(base, "main", ".git", "modules", "docs", "worktrees", "wt");
      await mkdir(gitdir, { recursive: true });
      await writeFile(join(work, ".git"), `gitdir: ${gitdir}\n`);
      await writeFile(join(gitdir, "commondir"), "../..\n");
      await expect((await open()).close()).resolves.toBeUndefined();
      await writeFile(join(gitdir, "commondir"), "../../../x\n");
      await expect(open()).rejects.toThrow(join(gitdir, "commondir"));
    });
  });
});
