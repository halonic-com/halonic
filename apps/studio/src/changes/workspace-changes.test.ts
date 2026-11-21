import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { DefinitionStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

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

    it("reads a folder inside a larger repository when the shell refuses rev-parse as not opened", async () => {
      const { changes } = history(async () => {
        throw { kind: "folder_not_opened", message: "the folder is not an opened folder" };
      });
      await expect(changes.read()).resolves.toEqual({ kind: "nested-repository" });
    });

    it("makes nothing when the shell refuses git init as not opened, so the read says why", async () => {
      const calls: string[][] = [];
      const { changes } = history(async (args) => {
        calls.push([...args]);
        throw { kind: "folder_not_opened", message: "the folder is not an opened folder" };
      });
      await expect(changes.turnOnHistory()).resolves.toBeUndefined();
      await expect(changes.read()).resolves.toEqual({ kind: "nested-repository" });
      expect(calls).toEqual([
        ["init", "--quiet"],
        ["rev-parse", "--is-inside-work-tree"],
      ]);
    });

    it("lets any other refusal from the shell through", async () => {
      const refusal = { kind: "timed_out", message: "git took too long" };
      const { changes } = history(async () => {
        throw refusal;
      });
      await expect(changes.read()).rejects.toBe(refusal);
      await expect(changes.turnOnHistory()).rejects.toBe(refusal);
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

      it("writes a file that is gone only while it is still absent", async () => {
        const files = fakeFiles();
        const { changes } = history(async () => answer(""), files);
        await changes.replaceFile("a.yaml", "old\n", null);
        expect(files.write).toHaveBeenCalledWith("a.yaml", "old\n", { expected: "absent" });
      });

      it("removes a file only while it still holds what the page read", async () => {
        const files = fakeFiles({ "a.yaml": "new\n" });
        const { changes } = history(async () => answer(""), files);
        await expect(changes.removeFile("a.yaml", "new\n")).resolves.toBe("replaced");
        expect(files.remove).toHaveBeenCalledWith("a.yaml", {
          expected: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        });
        files.remove.mockResolvedValueOnce({ status: "changed-on-disk", current: "x" } as never);
        await expect(changes.removeFile("a.yaml", "new\n")).resolves.toBe("changed-on-disk");
      });

      it("keeps a copy in the copies store, named by the time, and leaves the folder's files alone", async () => {
        const files = fakeFiles();
        const copies = fakeFiles();
        const { changes } = history(async () => answer(""), files, copies);
        await changes.keepCopy([{ path: "hubs/a.yaml", text: "mine\n" }]);
        expect([...copies.files.keys()]).toHaveLength(1);
        expect([...copies.files.keys()][0]).toMatch(
          /^\d{4}-\d{2}-\d{2}T[\d-]+\.\d+Z\/hubs\/a\.yaml$/,
        );
        expect(files.write).not.toHaveBeenCalled();
      });

      it("writes a kept copy into a real folder under .studio/discarded, which the folder's own store refuses", async () => {
        const folder = mkdtempSync(join(tmpdir(), "halonic-discard-"));
        try {
          const kept = join(folder, ".studio", "discarded");
          mkdirSync(kept, { recursive: true });
          const workspace = new FolderDefinitionStore(folder);
          const changes = new WorkspaceChanges({
            git: async () => answer(""),
            files: workspace,
            copies: new FolderDefinitionStore(kept),
            choices: choicesMemory(undefined, "test"),
            digest: sha256,
            onFocus: () => () => {},
            onFilesChanged: () => () => {},
          });
          await expect(workspace.write(".studio/discarded/x/a.yaml", "x")).rejects.toThrow();
          await changes.keepCopy([{ path: "hubs/a.yaml", text: "mine\n" }]);
          const [stamp] = readdirSync(kept);
          expect(readFileSync(join(kept, stamp ?? "", "hubs", "a.yaml"), "utf8")).toBe("mine\n");
        } finally {
          rmSync(folder, { recursive: true, force: true });
        }
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
