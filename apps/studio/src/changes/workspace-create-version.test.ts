import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DefinitionStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

const sha256 = {
  sha256: async (data: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
};
const answer = (stdout: string, code = 0, stderr = ""): GitAnswer => ({ code, stdout, stderr });

/** A folder's files in memory; `write` counts what it was asked. */
function fakeFiles(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: async (path: string) => files.get(path) ?? null,
    write: vi.fn(async (path: string, content: string, _options?: { expected?: string }) => {
      files.set(path, content);
      return { status: "written" as const };
    }),
    remove: vi.fn(async (path: string, _options?: { expected?: string }) => {
      files.delete(path);
      return { status: "removed" as const };
    }),
  };
}

/** Adds `listener` to `listeners`; the returned function removes it. */
function watching(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function history(
  git: (args: readonly string[]) => Promise<GitAnswer>,
  files = fakeFiles(),
  copies: Pick<DefinitionStore, "write"> = fakeFiles(),
) {
  const focus = new Set<() => void>();
  const changed = new Set<() => void>();
  const changes = new WorkspaceChanges({
    git,
    files,
    copies,
    choices: choicesMemory(undefined, "test"),
    digest: sha256,
    onFocus: (listener) => watching(focus, listener),
    onFilesChanged: (listener) => watching(changed, listener),
  });
  return { changes, files, focus, changed };
}

verifies("source-control.create-version", () => {
  describe("WorkspaceChanges.createVersion", () => {
    it("adds and commits only the given paths, with the message", async () => {
      const calls: (readonly string[])[] = [];
      const { changes } = history(async (args) => {
        calls.push(args);
        return answer("");
      });
      await changes.createVersion({
        message: "First reply flow\n\nTone changed.",
        paths: ["agents/triage.agent.yaml", "skills/tone/SKILL.md"],
      });
      expect(calls).toEqual([
        [
          "ls-files",
          "-z",
          "--others",
          "--exclude-standard",
          "--",
          "agents/triage.agent.yaml",
          "skills/tone/SKILL.md",
        ],
        [
          "commit",
          "-m",
          "First reply flow\n\nTone changed.",
          "--",
          "agents/triage.agent.yaml",
          "skills/tone/SKILL.md",
        ],
      ]);
    });

    it("adds only the files git doesn't know yet, so renames and deletions can be committed", async () => {
      const calls: (readonly string[])[] = [];
      const { changes } = history(async (args) => {
        calls.push(args);
        return args[0] === "ls-files" ? answer("new.md\0") : answer("");
      });
      await changes.createVersion({ message: "m", paths: ["old.md", "renamed.md", "new.md"] });
      expect(calls.map((args) => args[0])).toEqual(["ls-files", "add", "commit"]);
      expect(calls[1]).toEqual(["add", "--", "new.md"]);
      expect(calls[2]?.slice(-3)).toEqual(["old.md", "renamed.md", "new.md"]);
    });

    it("doesn't commit when adding failed, and says another program has the history", async () => {
      const calls: string[] = [];
      const { changes } = history(async (args) => {
        calls.push(args[0] ?? "");
        return args[0] === "ls-files"
          ? answer("a.md\0")
          : answer("", 128, "fatal: Unable to create index.lock\nsecond line");
      });
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "Another program is using this workspace's history right now.",
      );
      expect(calls).toEqual(["ls-files", "add"]);
    });

    it("says there is nothing to record when git has nothing to commit", async () => {
      const { changes } = history(async (args) =>
        args[0] === "commit" ? answer("nothing to commit, working tree clean", 1) : answer(""),
      );
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "There is nothing to record",
      );
    });

    it("says that a hook or permission stopped it, and never shows git's own words", async () => {
      const { changes } = history(async (args) =>
        args[0] === "commit"
          ? answer("", 1, "error: pre-commit hook failed\nsecret detail")
          : answer(""),
      );
      const failure = changes.createVersion({ message: "x", paths: ["a.md"] });
      await expect(failure).rejects.toThrow(
        "A check on this workspace or a permission stopped it.",
      );
      await expect(failure).rejects.not.toThrow("secret detail");
    });

    it("keeps the hook sentence when a hook fails with a permission error", async () => {
      const { changes } = history(async (args) =>
        args[0] === "commit"
          ? answer("", 1, "fatal: cannot exec '.git/hooks/pre-commit': Permission denied")
          : answer(""),
      );
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "A check on this workspace or a permission stopped it.",
      );
    });

    it("falls back to a plain sentence for anything else", async () => {
      const { changes } = history(async (args) =>
        args[0] === "commit" ? answer("", 1, "fatal: weird thing") : answer(""),
      );
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "Git didn't accept the version.",
      );
    });

    it("says that git doesn't know who the version is from", async () => {
      const { changes } = history(async (args) =>
        args[0] === "commit"
          ? answer("", 128, "Author identity unknown\n\n*** Please tell me who you are.")
          : answer(""),
      );
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "Git doesn't know who versions should be from.",
      );
    });

    it("says git is missing when the shell found no git program", async () => {
      const { changes } = history(async () => {
        throw { kind: "git_not_found" };
      });
      await expect(changes.createVersion({ message: "x", paths: ["a.md"] })).rejects.toThrow(
        "git isn't on this computer.",
      );
    });

    it("commits a staged rename, a staged deletion and a new file in a real repository", async () => {
      const dir = mkdtempSync(join(tmpdir(), "version-"));
      try {
        const git = (...args: string[]) =>
          execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
            cwd: dir,
            encoding: "utf8",
          });
        git("init", "--quiet");
        writeFileSync(join(dir, "old.md"), "one\ntwo\nthree\nfour\n");
        writeFileSync(join(dir, "gone.md"), "bye\n");
        git("add", "--all");
        git("commit", "-m", "first", "--quiet");
        mkdirSync(join(dir, "sub"));
        git("mv", "old.md", "sub/renamed.md");
        git("rm", "--quiet", "gone.md");
        writeFileSync(join(dir, "new.md"), "fresh\n");
        const { changes } = history(async (args) => {
          const run = spawnSync(
            "git",
            ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args],
            { cwd: dir, encoding: "utf8" },
          );
          return { code: run.status, stdout: run.stdout, stderr: run.stderr };
        });
        await changes.createVersion({
          message: "second",
          paths: ["old.md", "sub/renamed.md", "gone.md", "new.md"],
        });
        expect(git("status", "--porcelain")).toBe("");
        expect(git("show", "--name-status", "--format=", "HEAD").split("\n").sort()).toEqual([
          "",
          "A\tnew.md",
          "D\tgone.md",
          "R100\told.md\tsub/renamed.md",
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
