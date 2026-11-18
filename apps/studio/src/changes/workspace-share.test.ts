import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

/** A history that runs the given git, with files that are never touched. */
function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const files = {
    read: async () => null,
    write: async () => ({ status: "written" as const }),
    remove: async () => ({ status: "removed" as const }),
  };
  const never = () => () => undefined;
  return new WorkspaceChanges({
    git,
    files,
    copies: files,
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: async () => new Uint8Array(32) },
    onFocus: never,
    onFilesChanged: never,
  });
}

const identity = ["-c", "user.name=T", "-c", "user.email=t@example.com"];

/** Runs real git in `dir`; the answer is what the shell would give. */
const realGit = (dir: string) => async (args: readonly string[]) => {
  const run = spawnSync("git", [...identity, ...args], { cwd: dir, encoding: "utf8" });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
};

function commit(dir: string, name: string) {
  writeFileSync(join(dir, name), name);
  spawnSync("git", ["add", name], { cwd: dir });
  spawnSync("git", [...identity, "commit", "--quiet", "-m", name], { cwd: dir });
}

verifies("source-control.share-versions", () => {
  describe("WorkspaceChanges.countUnshared and share", () => {
    it("counts every version before the first share, then none after sharing", async () => {
      const root = mkdtempSync(join(tmpdir(), "share-versions-"));
      try {
        const remote = join(root, "remote.git");
        const work = join(root, "work");
        spawnSync("git", ["init", "--quiet", "--bare", remote]);
        spawnSync("git", ["init", "--quiet", work]);
        commit(work, "a.txt");
        commit(work, "b.txt");
        const changes = history(realGit(work));
        await changes.addRemote(remote);
        expect(await changes.countUnshared()).toBe(2);
        await changes.share();
        expect(await changes.countUnshared()).toBe(0);
        commit(work, "c.txt");
        expect(await changes.countUnshared()).toBe(1);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("counts none for a repository with no version yet", async () => {
      const root = mkdtempSync(join(tmpdir(), "share-versions-"));
      try {
        spawnSync("git", ["init", "--quiet", root]);
        expect(await history(realGit(root)).countUnshared()).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("asks the shell for exactly `push --quiet --set-upstream origin HEAD`", async () => {
      const asked: (readonly string[])[] = [];
      await history(async (args) => {
        asked.push(args);
        return { code: 0, stdout: "", stderr: "" };
      }).share();
      expect(asked).toEqual([["push", "--quiet", "--set-upstream", "origin", "HEAD"]]);
    });

    it("says the shared copy has newer versions when git rejects the push", async () => {
      const changes = history(async () => ({
        code: 1,
        stdout: "",
        stderr: "! [rejected] HEAD -> main (fetch first)\nerror: failed to push some refs",
      }));
      await expect(changes.share()).rejects.toThrow("Get updates first");
    });

    it("never shows git's own output when sharing fails for another reason", async () => {
      const changes = history(async () => ({
        code: 128,
        stdout: "",
        stderr: "fatal: unable to access 'https://x.example/a.git/': Could not resolve host",
      }));
      const error = await changes.share().catch((caught: unknown) => caught);
      expect(String(error)).toContain("can't reach the shared copy");
      expect(String(error)).not.toContain("x.example");
    });
  });
});
