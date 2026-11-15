import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";

const sha256 = {
  sha256: async (data: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
};
const hash = "0".repeat(40);
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
  };
}

/** Adds `listener` to `listeners`; the returned function removes it. */
function watching(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function history(git: (args: readonly string[]) => Promise<GitAnswer>, files = fakeFiles()) {
  const focus = new Set<() => void>();
  const changed = new Set<() => void>();
  const changes = new WorkspaceChanges({
    git,
    files,
    digest: sha256,
    onFocus: (listener) => watching(focus, listener),
    onFilesChanged: (listener) => watching(changed, listener),
  });
  return { changes, files, focus, changed };
}

verifies("source-control.changes-page", () => {
  describe("WorkspaceChanges", () => {
    it("lists the changed files of a repository, leaving out Halonic's own folders", async () => {
      const status = [
        `1 .M N... 100644 100644 100644 ${hash} ${hash} hubs/sales/hub.yaml`,
        "? .halonic/review/p1.json",
        "",
      ].join("\0");
      const { changes } = history(async (args) =>
        args[0] === "rev-parse" ? answer("true\n") : answer(status),
      );
      expect(await changes.read()).toEqual({
        kind: "ready",
        changes: [{ path: "hubs/sales/hub.yaml", status: "modified", staged: false }],
      });
    });

    it("says not-a-repository for a folder git doesn't know", async () => {
      const { changes } = history(async () => answer("", 128, "fatal: not a git repository"));
      expect(await changes.read()).toEqual({ kind: "not-a-repository" });
    });

    it("says no-git when the shell found no git program", async () => {
      const { changes } = history(async () => {
        throw { kind: "git_not_found", message: "git isn't installed" };
      });
      expect(await changes.read()).toEqual({ kind: "no-git" });
    });

    it("throws git's own words when status fails", async () => {
      const { changes } = history(async (args) =>
        args[0] === "rev-parse" ? answer("true\n") : answer("", 1, "fatal: index file corrupt"),
      );
      await expect(changes.read()).rejects.toThrow("fatal: index file corrupt");
    });

    it("explains dubious ownership instead of offering to turn on history", async () => {
      const stderr =
        "fatal: detected dubious ownership in repository at '/w'\nTo add an exception...";
      const { changes } = history(async () => answer("", 128, stderr));
      await expect(changes.read()).rejects.toMatchObject({
        kind: "unavailable",
        message: expect.stringContaining("another user owns its folder"),
      });
    });

    it("explains a locked or unreadable history in a sentence", async () => {
      const locked = history(async (args) =>
        args[0] === "rev-parse"
          ? answer("true\n")
          : answer("", 128, "fatal: Unable to create '/w/.git/index.lock': File exists."),
      );
      await expect(locked.changes.read()).rejects.toThrow("Another program is using");
      const denied = history(async () =>
        answer("", 1, "error: cannot open .git: Permission denied"),
      );
      await expect(denied.changes.turnOnHistory()).rejects.toThrow(
        "Check that you have permission",
      );
    });

    it("shows only the first line of a multi-line git message", async () => {
      const stderr = "\nfatal: index file corrupt\nhint: run git fsck\nhint: then retry\n";
      const status = history(async (args) =>
        args[0] === "rev-parse" ? answer("true\n") : answer("", 1, stderr),
      );
      await expect(status.changes.read()).rejects.toMatchObject({
        kind: "unavailable",
        message: "fatal: index file corrupt",
      });
      const init = history(async () => answer("", 1, stderr));
      await expect(init.changes.turnOnHistory()).rejects.toMatchObject({
        kind: "unavailable",
        message: "fatal: index file corrupt",
      });
    });

    it("lets any other refusal from the shell through", async () => {
      const refusal = { kind: "folder_not_opened", message: "not opened" };
      const { changes } = history(async () => {
        throw refusal;
      });
      await expect(changes.read()).rejects.toBe(refusal);
    });

    it("turns history on: the .studio line in a new .gitignore, then git init", async () => {
      const calls: string[][] = [];
      const { changes, files } = history(async (args) => {
        calls.push([...args]);
        return answer("");
      });
      await changes.turnOnHistory();
      expect(files.files.get(".gitignore")).toBe(".studio/\n");
      expect(calls).toEqual([["init", "--quiet"]]);
    });

    it("adds the line to an existing .gitignore that lacks it, on its own line", async () => {
      const { changes, files } = history(
        async () => answer(""),
        fakeFiles({ ".gitignore": "node_modules" }),
      );
      await changes.turnOnHistory();
      expect(files.files.get(".gitignore")).toBe("node_modules\n.studio/\n");
    });

    it("leaves a .gitignore that already ignores .studio as it is", async () => {
      const { changes, files } = history(
        async () => answer(""),
        fakeFiles({ ".gitignore": "/.studio\n" }),
      );
      await changes.turnOnHistory();
      expect(files.write).not.toHaveBeenCalled();
    });

    it("doesn't run git init when .gitignore can't be written", async () => {
      const git = vi.fn(async () => answer(""));
      const files = fakeFiles();
      files.write.mockResolvedValueOnce({ status: "changed-on-disk" as never });
      const { changes } = history(git, files);
      await expect(changes.turnOnHistory()).rejects.toMatchObject({
        kind: "conflict",
        message: expect.stringContaining(".gitignore changed"),
      });
      expect(git).not.toHaveBeenCalled();
    });

    it("reports a failed git init with git's words", async () => {
      const { changes } = history(async () => answer("", 1, "fatal: cannot mkdir .git"));
      await expect(changes.turnOnHistory()).rejects.toMatchObject({
        kind: "unavailable",
        message: "fatal: cannot mkdir .git",
      });
    });

    it("wakes its listener when the window comes to the front or a file changed, until stopped", () => {
      const { changes, focus, changed } = history(async () => answer(""));
      const listener = vi.fn();
      const stop = changes.subscribe(listener);
      for (const wake of [...focus, ...changed]) wake();
      expect(listener).toHaveBeenCalledTimes(2);
      stop();
      expect(focus.size + changed.size).toBe(0);
    });
    describe("reading a changed file", () => {
      const diffText = "--- a/a.yaml\n+++ b/a.yaml\n@@ -1 +1 @@\n-old\n+new\n";
      const modified = { path: "a.yaml", status: "modified", staged: false } as const;

      it("rebuilds the last version from the diff and reads the file as it is", async () => {
        const calls: (readonly string[])[] = [];
        const { changes } = history(
          async (args) => {
            calls.push(args);
            return answer(diffText);
          },
          fakeFiles({ "a.yaml": "new\n" }),
        );
        expect(await changes.readTexts(modified)).toEqual({ before: "old\n", after: "new\n" });
        expect(calls[0]).toEqual([
          "diff",
          "HEAD",
          "--no-color",
          "--unified=999999",
          "--",
          "a.yaml",
        ]);
      });

      it("has no last version for an untracked file and no current text for a deleted one", async () => {
        const git = vi.fn(async () => answer("--- a/a.yaml\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n"));
        const { changes } = history(git, fakeFiles());
        expect(await changes.readTexts({ ...modified, status: "untracked" })).toEqual({
          before: null,
          after: null,
        });
        expect(await changes.readTexts({ ...modified, status: "deleted" })).toEqual({
          before: "old\n",
          after: null,
        });
        expect(git).toHaveBeenCalledTimes(1);
      });

      it("has no last version in a repository without a version yet", async () => {
        const { changes } = history(
          async (args) =>
            args[0] === "diff" ? answer("", 128, "fatal: bad revision 'HEAD'") : answer("", 1),
          fakeFiles({ "a.yaml": "new\n" }),
        );
        expect(await changes.readTexts(modified)).toEqual({ before: null, after: "new\n" });
      });

      it("throws git's reason when the diff fails in a repository with versions", async () => {
        const { changes } = history(
          async (args) => (args[0] === "diff" ? answer("", 1, "fatal: oops") : answer("abc\n")),
          fakeFiles({ "a.yaml": "new\n" }),
        );
        await expect(changes.readTexts(modified)).rejects.toThrow("fatal: oops");
      });
    });

    describe("replacing a file", () => {
      it("writes only while the file still holds what the page read", async () => {
        const files = fakeFiles({ "a.yaml": "new\n" });
        const { changes } = history(async () => answer(""), files);
        await expect(changes.replaceFile("a.yaml", "old\n", "new\n")).resolves.toBe("replaced");
        expect(files.write).toHaveBeenCalledWith("a.yaml", "old\n", {
          expected: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        });
      });

      it("says changed-on-disk when the store refuses", async () => {
        const files = fakeFiles();
        files.write.mockResolvedValueOnce({ status: "changed-on-disk", current: "x" } as never);
        const { changes } = history(async () => answer(""), files);
        await expect(changes.replaceFile("a.yaml", "old\n", "new\n")).resolves.toBe(
          "changed-on-disk",
        );
      });
    });
  });
});

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
