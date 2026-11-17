import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

const answer = (stdout: string, code = 0, stderr = ""): GitAnswer => ({ code, stdout, stderr });

/** A source that reads the workspace's history through `git`; nothing else of it is used. */
function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const never = async () => {
    throw new Error("not used");
  };
  const changes = new WorkspaceChanges({
    git,
    files: { read: never, write: never, remove: never },
    copies: { write: never },
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: never },
    onFocus: () => () => undefined,
    onFilesChanged: () => () => undefined,
  });
  return { changes };
}

verifies("source-control.history", () => {
  describe("WorkspaceChanges history", () => {
    const realGit = (dir: string) => async (args: readonly string[]) => {
      const run = spawnSync(
        "git",
        ["-c", "user.name=Sam", "-c", "user.email=sam@example.com", ...args],
        { cwd: dir, encoding: "utf8" },
      );
      return { code: run.status, stdout: run.stdout, stderr: run.stderr };
    };

    it("reads the newest versions of a real repository, newest first, without Halonic's folders", async () => {
      const dir = mkdtempSync(join(tmpdir(), "history-"));
      try {
        const run = realGit(dir);
        await run(["init", "--quiet"]);
        mkdirSync(join(dir, ".halonic", "review"), { recursive: true });
        writeFileSync(join(dir, "a.md"), "1\n");
        writeFileSync(join(dir, ".halonic", "review", "p.json"), "{}\n");
        await run(["add", "."]);
        await run(["commit", "-m", "First\n\nWith notes", "--quiet"]);
        writeFileSync(join(dir, "a.md"), "2\n");
        await run(["commit", "-am", "Second", "--quiet"]);
        const { changes } = history(run);
        const versions = await changes.readHistory(1);
        expect(versions).toHaveLength(1);
        expect(versions[0]).toMatchObject({ name: "Second", author: "Sam", files: ["a.md"] });
        const both = await changes.readHistory(5);
        expect(both.map((v) => v.name)).toEqual(["Second", "First"]);
        expect(both[1]).toMatchObject({ notes: "With notes", files: ["a.md"] });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("gives no versions for a repository with none yet", async () => {
      const dir = mkdtempSync(join(tmpdir(), "history-"));
      try {
        const run = realGit(dir);
        await run(["init", "--quiet"]);
        expect(await history(run).changes.readHistory(20)).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("gives no versions without git, and fails with git's reason otherwise", async () => {
      const missing = history(async () => {
        throw { kind: "git_not_found" };
      });
      expect(await missing.changes.readHistory(20)).toEqual([]);
      const locked = history(async (args) =>
        args[0] === "log" ? answer("", 128, "fatal: Unable to create index.lock") : answer("abc\n"),
      );
      await expect(locked.changes.readHistory(20)).rejects.toThrow(/using this workspace/);
    });
  });
});
