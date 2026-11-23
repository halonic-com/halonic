// The page's reader of the live version (HAL-14229), against real git, as the shell runs it.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { liveVersionOf } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { GitMissingError, PageVersions } from "./page-versions.ts";

const identity = ["-c", "user.name=Sam", "-c", "user.email=sam@acme.example"];

/** Runs git in `dir` for the test's own setup. */
function git(dir: string, args: readonly string[], input?: string): string {
  const run = spawnSync("git", [...identity, ...args], { cwd: dir, encoding: "utf8", input });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

/** The subcommands and options the shell's allow-list takes from this reader (`git-allow-list`). */
const allowed: Record<string, readonly string[]> = {
  "rev-parse": ["--is-inside-work-tree", "--verify", "--quiet"],
  log: ["-z", "--format", "--max-count"],
  "ls-tree": ["-r", "-z"],
  show: [],
};

/** Real git in `dir`, as the shell's `git` command answers; refuses what the shell's list doesn't take. */
function shellGit(dir: string, calls: string[][] = []) {
  return async (args: readonly string[]) => {
    calls.push([...args]);
    const [subcommand = "", ...rest] = args;
    const options = rest.filter((arg) => arg.startsWith("-")).map((arg) => arg.split("=")[0]);
    const takes = allowed[subcommand];
    if (takes === undefined || options.some((option) => !takes.includes(option ?? ""))) {
      throw { kind: "option_not_allowed", message: args.join(" ") };
    }
    const run = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    return { code: run.status, stdout: run.stdout, stderr: run.stderr };
  };
}

/** Writes each file in `dir` and records them all as one version; gives its id. */
function commit(dir: string, files: Record<string, string>, message = "A version"): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, ["add", "--all"]);
  git(dir, ["commit", "--quiet", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

/** Runs `test` in a new folder, which it deletes afterwards. */
function inFolder(test: (dir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "page-versions-"));
    try {
      await test(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

const agent = "hubs/support/agents/writer.agent.yaml";

verifies("studio.page-versions", () => {
  describe("PageVersions", () => {
    it(
      "reads the latest commit and its files, not the saved files",
      inFolder(async (dir) => {
        git(dir, ["init", "--quiet"]);
        const first = commit(dir, { [agent]: "id: writer\nname: Writer\n" }, "First version");
        writeFileSync(join(dir, agent), "id: writer\nname: Not live yet\n");
        const versions = new PageVersions({ git: shellGit(dir), hasGitFolder: async () => true });

        const live = await liveVersionOf(versions);
        expect(live).toMatchObject({
          kind: "commit",
          commit: { hash: first, author: "Sam", message: "First version" },
        });
        expect(await versions.readAt(first, agent)).toBe("id: writer\nname: Writer\n");
        expect(await versions.listAt(first, "hubs/support")).toEqual([agent]);
        expect(await versions.listAt(first)).toEqual([agent]);
        expect(await versions.readAt(first, "hubs/support/agents/none.agent.yaml")).toBeNull();
        expect(await versions.listAt(first, "hubs/billing")).toBeNull();
      }),
    );

    it(
      "says history is on with nothing live before the first version",
      inFolder(async (dir) => {
        git(dir, ["init", "--quiet"]);
        const versions = new PageVersions({ git: shellGit(dir), hasGitFolder: async () => true });
        expect(await liveVersionOf(versions)).toEqual({ kind: "none-yet" });
      }),
    );

    it(
      "says history is off for a folder that isn't a repository",
      inFolder(async (dir) => {
        const versions = new PageVersions({ git: shellGit(dir), hasGitFolder: async () => false });
        expect(await liveVersionOf(versions)).toEqual({ kind: "history-off" });
      }),
    );

    it(
      "leaves out a link and a submodule, as the CLI's GitVcs does",
      inFolder(async (dir) => {
        git(dir, ["init", "--quiet"]);
        const first = commit(dir, { [agent]: "id: writer\nname: Writer\n" });
        const target = git(dir, ["hash-object", "-w", "--stdin"], "id: linked\nname: Linked\n");
        const linked = "hubs/support/agents/linked.agent.yaml";
        const sub = "hubs/support/agents/sub.agent.yaml";
        git(dir, ["update-index", "--add", "--cacheinfo", `120000,${target},${linked}`]);
        git(dir, ["update-index", "--add", "--cacheinfo", `160000,${first},${sub}`]);
        git(dir, ["commit", "--quiet", "-m", "A link and a submodule"]);
        const second = git(dir, ["rev-parse", "HEAD"]);
        const versions = new PageVersions({ git: shellGit(dir), hasGitFolder: async () => true });

        expect(await versions.listAt(second, "hubs/support/agents")).toEqual([agent]);
        expect(await versions.readAt(second, linked)).toBeNull();
        expect(await versions.readAt(second, sub)).toBeNull();
      }),
    );

    it(
      "lists a commit's files once, however many it reads",
      inFolder(async (dir) => {
        git(dir, ["init", "--quiet"]);
        const first = commit(dir, { [agent]: "id: writer\n", "workspace.yaml": "id: acme\n" });
        const calls: string[][] = [];
        const versions = new PageVersions({
          git: shellGit(dir, calls),
          hasGitFolder: async () => true,
        });
        await versions.readAt(first, agent);
        await versions.readAt(first, "workspace.yaml");
        await versions.listAt(first);
        expect(calls.filter(([subcommand]) => subcommand === "ls-tree")).toEqual([
          ["ls-tree", "-r", "-z", first],
        ]);
      }),
    );

    it(
      "refuses a version that isn't a full id and one the repository doesn't have",
      inFolder(async (dir) => {
        git(dir, ["init", "--quiet"]);
        commit(dir, { [agent]: "id: writer\n" });
        const calls: string[][] = [];
        const versions = new PageVersions({
          git: shellGit(dir, calls),
          hasGitFolder: async () => true,
        });
        await expect(versions.readAt("--output=x", agent)).rejects.toThrow(RangeError);
        await expect(versions.readAt("HEAD", agent)).rejects.toThrow(RangeError);
        expect(calls).toEqual([]);
        await expect(versions.listAt("0".repeat(40))).rejects.toThrow(
          `Unknown version ${"0".repeat(40)}`,
        );
      }),
    );

    it("refuses, rather than reading the saved files, when git isn't there but .git is", async () => {
      const noGit = async () => {
        throw { kind: "git_not_found", message: "git was not found" };
      };
      const withHistory = new PageVersions({ git: noGit, hasGitFolder: async () => true });
      await expect(liveVersionOf(withHistory)).rejects.toBeInstanceOf(GitMissingError);
      await expect(liveVersionOf(withHistory)).rejects.toMatchObject({
        kind: "unavailable",
        message: "git isn't on this computer.",
      });
      const withoutHistory = new PageVersions({ git: noGit, hasGitFolder: async () => false });
      expect(await liveVersionOf(withoutHistory)).toEqual({ kind: "history-off" });
    });

    it("says history is off for a folder inside a larger repository", async () => {
      const nested = new PageVersions({
        git: async () => {
          throw { kind: "folder_not_opened", message: "The repository's top is outside" };
        },
        hasGitFolder: async () => false,
      });
      expect(await liveVersionOf(nested)).toEqual({ kind: "history-off" });
    });

    // HAL-16298: a git worktree whose main repository lies outside the opened folder.
    it("refuses a folder with its own .git that the shell won't open, rather than calling its history off", async () => {
      const worktree = new PageVersions({
        git: async () => {
          throw { kind: "folder_not_opened", message: "The repository's git folder is outside" };
        },
        hasGitFolder: async () => true,
      });
      await expect(liveVersionOf(worktree)).rejects.toMatchObject({
        kind: "unavailable",
        message:
          "This folder keeps its git files outside it, as a git worktree does, so Studio can't read its versions.",
        fix: "Open the repository's own folder, with its .git folder inside it, or clone the repository into a folder of its own.",
      });
    });

    it("refuses a folder git won't open, rather than calling its history off", async () => {
      const refused = new PageVersions({
        git: async () => ({
          code: 128,
          stdout: "",
          stderr: "fatal: detected dubious ownership in repository",
        }),
        hasGitFolder: async () => true,
      });
      await expect(liveVersionOf(refused)).rejects.toMatchObject({ kind: "unavailable" });
    });
  });
});
