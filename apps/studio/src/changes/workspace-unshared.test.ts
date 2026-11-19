import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

/** A history that runs the given git; nothing else of it is used. */
function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const never = async () => {
    throw new Error("not used");
  };
  return new WorkspaceChanges({
    git,
    files: { read: never, write: never, remove: never },
    copies: { write: never },
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: never },
    onFocus: () => () => undefined,
    onFilesChanged: () => () => undefined,
  });
}

const identity = ["-c", "user.name=T", "-c", "user.email=t@example.com"];

/** Runs real git in `dir`; the answer is what the shell would give. */
const realGit = (dir: string) => async (args: readonly string[]) => {
  const run = spawnSync("git", [...identity, ...args], { cwd: dir, encoding: "utf8" });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
};

/** Records `path` as a new version in `dir` and gives the version's id. */
function commit(dir: string, path: string): string {
  writeFileSync(join(dir, path), path);
  spawnSync("git", ["add", path], { cwd: dir });
  spawnSync("git", [...identity, "commit", "--quiet", "-m", path], { cwd: dir });
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

verifies("source-control.history-not-shared", () => {
  describe("WorkspaceChanges.listUnshared", () => {
    it("lists every version in History before the first share, newest first", async () => {
      const root = mkdtempSync(join(tmpdir(), "history-not-shared-"));
      try {
        const work = join(root, "work");
        spawnSync("git", ["init", "--quiet", "--bare", join(root, "remote.git")]);
        spawnSync("git", ["init", "--quiet", work]);
        const first = commit(work, "a.txt");
        const second = commit(work, "b.txt");
        const changes = history(realGit(work));
        await changes.addRemote(join(root, "remote.git"));
        expect(await changes.listUnshared()).toEqual([second, first]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("lists only the new versions that touch the workspace folder, and none after sharing", async () => {
      const root = mkdtempSync(join(tmpdir(), "history-not-shared-"));
      try {
        const repo = join(root, "repo");
        const workspace = join(repo, "acme");
        spawnSync("git", ["init", "--quiet", "--bare", join(root, "remote.git")]);
        spawnSync("git", ["init", "--quiet", repo]);
        mkdirSync(workspace);
        commit(repo, "acme/a.txt");
        const changes = history(realGit(workspace));
        await changes.addRemote(join(root, "remote.git"));
        await changes.share();
        const inside = commit(repo, "acme/b.txt");
        commit(repo, "outside.txt");
        expect(await changes.listUnshared()).toEqual([inside]);
        await changes.share();
        expect(await changes.listUnshared()).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("lists none for a repository with no version yet", async () => {
      const root = mkdtempSync(join(tmpdir(), "history-not-shared-"));
      try {
        spawnSync("git", ["init", "--quiet", root]);
        expect(await history(realGit(root)).listUnshared()).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
