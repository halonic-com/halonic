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

let setup: Setup | undefined;

/**
 * On Windows, git has once exited 1 with no message while committing the
 * fresh workspace (HAL-7720), most likely because something held a file
 * there for a moment. A new attempt gets new folders, so it can't meet
 * what the failed one left.
 */
const setupAttempts = 3;

async function createSetup(): Promise<Setup> {
  const top = await realpath(await mkdtemp(join(tmpdir(), "harness-profile-worktree-")));
  const runners: GitRunner[] = [];
  try {
    return await buildSetup(top, runners);
  } catch (error) {
    for (const runner of runners) await runner.close();
    await rm(top, { recursive: true, force: true });
    throw error;
  }
}

/** Fills `top`; the runners it creates go into `runners`, so a failed attempt can close them. */
async function buildSetup(top: string, runners: GitRunner[]): Promise<Setup> {
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
  runners.push(runner);
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
  return { top, workspace, worktree: await realpath(worktree), profiles, runner };
}

beforeEach(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      setup = await createSetup();
      return;
    } catch (error) {
      console.warn(`worktree test setup attempt ${attempt} failed (HAL-7720):`, error);
      if (attempt === setupAttempts) throw error;
    }
  }
}, 120_000);

afterEach(async () => {
  // Empty when every attempt of the setup failed: it has cleaned up after itself.
  if (setup === undefined) return;
  await setup.runner.close();
  await rm(setup.top, { recursive: true, force: true });
  setup = undefined;
});

/** The setup of the running test. */
function ready(): Setup {
  if (setup === undefined) throw new Error("The test's setup didn't run.");
  return setup;
}

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
      const { profiles, worktree, workspace } = ready();

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
      const { profiles, worktree, workspace } = ready();
      // A repository made with git's default template has this folder.
      await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
      await symlink(join(workspace, ".git", "hooks"), join(worktree, "files"), "junction");

      await expect(profiles.profileOf(writerAgent(worktree), bridge)).rejects.toThrow(
        /leads out of/,
      );
    });

    it("refuses a working folder that a link leads to the worktree's own .git", async () => {
      const { profiles, worktree } = ready();
      const gitdir = await gitdirOf(worktree);
      await symlink(gitdir, join(worktree, "files"), "junction");

      await expect(profiles.profileOf(writerAgent(worktree), bridge)).rejects.toThrow(
        /leads out of/,
      );
    });
  });
});
