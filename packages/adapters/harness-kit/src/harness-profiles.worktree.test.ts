// Julian's `.git` case (HAL-3188, `app.run-proposal-worktree`) on a real git
// worktree: a run's proposal folder is a worktree whose `.git` is a file that
// points at its record (gitdir) in the main repository, next to the hooks
// git runs. None of them may be writable from the sandbox.

import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { plainEnvironment, testGit } from "@halonicjs/adapter-git/testing";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writerAgent } from "./harness-agent.test-helper.ts";
import { HarnessProfiles } from "./harness-profiles.ts";
import { isInsideOrSame, overlaps } from "./working-folder.ts";

const bridge = { url: "http://127.0.0.1:41817", token: "run-token" };

/** A workspace in git, with one run's worktree in Halonic's data folder. */
interface Setup {
  readonly top: string;
  readonly workspace: string;
  readonly worktree: string;
  readonly profiles: HarnessProfiles;
  readonly runner: GitRunner;
}

let setup: Setup;

beforeEach(async () => {
  const top = await realpath(await mkdtemp(join(tmpdir(), "harness-profile-worktree-")));
  const home = join(top, "home");
  const workspace = join(home, "work", "acme");
  const data = join(top, "data");
  for (const folder of [workspace, join(data, "tmp", "run_1"), join(top, "hooks")]) {
    await mkdir(folder, { recursive: true });
  }
  await mkdir(join(workspace, "agents"));
  await writeFile(join(workspace, "agents", "writer.agent.yaml"), "name: Writer\n");
  const runner = await GitRunner.create({
    git: await testGit(),
    environment: plainEnvironment(),
    hooksFolder: join(top, "hooks"),
  });
  const vcs = new GitVcs(workspace, {
    runner,
    author: { name: "Acme Tester", email: "tester@acme.example" },
    worktrees: join(data, "workspaces", "k1", "worktrees"),
  });
  await vcs.init();
  const version = await vcs.commitVersion({ message: "First version", exclude: [] });
  const { path: worktree } = await vcs.addWorktree(version);
  const profiles = new HarnessProfiles({
    workspace,
    halonicData: data,
    home,
    host: {
      agentFile: async () => ({
        workingFolder: null,
        allowedSites: [],
        install: { program: "/usr/bin/claude", packageFolder: null },
      }),
      tempFolder: async () => join(data, "tmp", "run_1"),
      settingsFolder: async () => null,
    },
    env: {},
    timeLimitMs: 600_000,
    platform: "linux",
  });
  setup = { top, workspace, worktree: await realpath(worktree), profiles, runner };
}, 60_000);

afterEach(async () => {
  await setup.runner.close();
  await rm(setup.top, { recursive: true, force: true });
});

/** The folders a program in the sandbox may write. */
function writableOf(profile: SandboxProfile): string[] {
  const { workingFolder, tempFolder, settingsFolder } = profile;
  return settingsFolder === null
    ? [workingFolder, tempFolder]
    : [workingFolder, tempFolder, settingsFolder];
}

/** The worktree's record in the main repository, as its `.git` file names it. */
async function gitdirOf(worktree: string): Promise<string> {
  const text = await readFile(join(worktree, ".git"), "utf8");
  const named = text.replace(/^gitdir:\s*/, "").trim();
  return await realpath(isAbsolute(named) ? named : resolve(worktree, named));
}

verifies("harness-kit.proposal-worktree-git", () => {
  describe("a proposal folder that is a git worktree", () => {
    it("keeps the .git file, the gitdir and the repository's hooks outside every writable folder", async () => {
      const { profiles, worktree, workspace } = setup;

      const { profile } = await profiles.profileOf(writerAgent(worktree), bridge);

      const gitdir = await gitdirOf(worktree);
      expect(isInsideOrSame(gitdir, join(workspace, ".git"))).toBe(true);
      const protectedPaths = [
        join(worktree, ".git"),
        join(worktree, ".git", "hooks", "post-checkout"),
        gitdir,
        join(workspace, ".git", "hooks", "post-checkout"),
      ];
      for (const writable of writableOf(profile)) {
        for (const path of protectedPaths) expect(overlaps(writable, path)).toBe(false);
      }
      expect(profile.readOnlyPaths).toContain(join(worktree, ".git"));
    });

    it("refuses a working folder that a link in the worktree leads to the repository's hooks", async () => {
      const { profiles, worktree, workspace } = setup;
      // A repository made with git's default template has this folder.
      await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
      await symlink(join(workspace, ".git", "hooks"), join(worktree, "files"), "junction");

      await expect(profiles.profileOf(writerAgent(worktree), bridge)).rejects.toThrow(
        /leads out of/,
      );
    });

    it("refuses a working folder that a link leads to the worktree's own .git", async () => {
      const { profiles, worktree } = setup;
      const gitdir = await gitdirOf(worktree);
      await symlink(gitdir, join(worktree, "files"), "junction");

      await expect(profiles.profileOf(writerAgent(worktree), bridge)).rejects.toThrow(
        /leads out of/,
      );
    });
  });
});
