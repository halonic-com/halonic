import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";

const hash = "0".repeat(40);
const answer = (stdout: string, code = 0, stderr = ""): GitAnswer => ({ code, stdout, stderr });

/** A folder's files in memory; `write` counts what it was asked. */
function fakeFiles(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: async (path: string) => files.get(path) ?? null,
    write: vi.fn(async (path: string, content: string) => {
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
  });
});
