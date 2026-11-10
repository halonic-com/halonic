import { readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { GitVcs } from "./vcs.ts";
import { plainTextPatchPaths } from "./vcs-patch.ts";

// The contract suite covers what every Vcs does with worktrees and patches;
// these are the git adapter's own rules: where worktrees go, git's record of
// each, and how a patch is read before `git apply` sees it.

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

/** A repository with one commit holding `files`, and a worktrees folder outside it. */
async function repoWith(files: Record<string, string>) {
  const folder = await repositoryWith(scratch, files);
  const worktrees = join(await scratch.folder(), "worktrees");
  const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor, worktrees });
  const [head] = await vcs.log(1);
  return { vcs, folder, head: head?.hash ?? "", files: new FolderDefinitionStore(folder) };
}

/** The folder git keeps its record of `id` in. */
function recordOf(folder: string, id: string): string {
  return join(folder, ".git", "worktrees", id);
}

verifies("git.worktrees", () => {
  describe("addWorktree, listWorktrees and removeWorktree", () => {
    it("checks a commit out, detached, into a folder named by its id, without the .env it tracks", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      await writeFiles(folder, { ".env": "KEY=placeholder\n" });
      await plainGit(folder, ["add", "--force", "--", ".env"]);
      await plainGit(folder, ["commit", "--quiet", "--message=Commit .env"]);
      const [withEnv] = await vcs.log(1);
      const before = await vcs.status();

      const worktree = await vcs.addWorktree(String(withEnv?.hash));

      expect(worktree.path.endsWith(worktree.id)).toBe(true);
      expect((await readdir(worktree.path)).sort()).toEqual([".git", "a.yaml"]);
      const worktreeHead = await plainGit(worktree.path, ["rev-parse", "HEAD"]);
      expect(worktreeHead.trim()).toBe(withEnv?.hash);
      expect(await plainGit(worktree.path, ["branch", "--show-current"])).toBe("");
      expect(await readdir(recordOf(folder, worktree.id))).toContain("gitdir");
      expect(await vcs.status()).toEqual(before);
      expect(head).not.toBe(withEnv?.hash);
    });

    it("lists the worktrees oldest first", async () => {
      const { vcs, head } = await repoWith({ "a.yaml": "1\n" });
      const added = [];
      for (let count = 0; count < 3; count++) added.push(await vcs.addWorktree(head));
      expect(await vcs.listWorktrees()).toEqual(added);
    });

    it("refuses a worktrees folder inside the workspace, or holding it, and without one", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      const runnerOf = await runner();
      for (const worktrees of [join(folder, ".studio", "worktrees"), join(folder, "..")]) {
        const inside = new GitVcs(folder, { runner: runnerOf, author: testAuthor, worktrees });
        await expect(inside.addWorktree(head)).rejects.toThrow(/can't be inside the workspace/u);
      }
      const without = new GitVcs(folder, { runner: runnerOf, author: testAuthor });
      await expect(without.addWorktree(head)).rejects.toThrow(/no folder for worktrees/u);
      expect(await without.listWorktrees()).toEqual([]);
      expect(await vcs.listWorktrees()).toEqual([]);
    });

    it("refuses a worktrees folder reached through a link that points into the workspace", async () => {
      const { folder, head } = await repoWith({ "a.yaml": "1\n" });
      await writeFiles(folder, { ".studio/worktrees/.keep": "" });
      const link = join(await scratch.folder(), "studio-link");
      await symlink(join(folder, ".studio"), link);

      const worktrees = join(link, "worktrees");
      const linked = new GitVcs(folder, { runner: await runner(), author: testAuthor, worktrees });

      await expect(linked.addWorktree(head)).rejects.toThrow(/can't be inside the workspace/u);
      expect(await readdir(join(folder, ".studio", "worktrees"))).toEqual([".keep"]);
    });

    it("removes a worktree whose folder is already gone, record and all", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      const worktree = await vcs.addWorktree(head);
      await rm(worktree.path, { recursive: true });
      expect(await vcs.listWorktrees()).toEqual([]);

      await vcs.removeWorktree(worktree.id);
      await expect(readdir(recordOf(folder, worktree.id))).rejects.toThrow();
      await expect(vcs.removeWorktree(worktree.id)).rejects.toThrow(
        `Unknown worktree ${worktree.id}`,
      );
    });
  });
});

verifies("git.worktree-git-folder-not-trusted", () => {
  describe("git's record of a worktree", () => {
    it("doesn't know a worktree whose record points at another folder", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      const worktree = await vcs.addWorktree(head);
      const elsewhere = join(await scratch.folder(), ".git");
      await writeFile(join(recordOf(folder, worktree.id), "gitdir"), `${elsewhere}\n`);

      await expect(vcs.diffBetween(head, worktree.id)).rejects.toThrow("Unknown worktree");
      expect(await vcs.listWorktrees()).toEqual([]);
    });

    it("runs no git in a worktree whose record was changed, and still removes it", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      const changes: [string, (record: string) => Promise<void>][] = [
        ["commondir", (record) => writeFile(join(record, "commondir"), "../../../planted\n")],
        ["config.worktree", (record) => writeFile(join(record, "config.worktree"), "")],
        ["a link", (record) => symlink(join(folder, "a.yaml"), join(record, "planted"))],
      ];
      for (const [label, change] of changes) {
        const worktree = await vcs.addWorktree(head);
        await change(recordOf(folder, worktree.id));
        await expect(vcs.diffBetween(head, worktree.id), label).rejects.toThrow(/was changed/u);
        await vcs.removeWorktree(worktree.id);
      }
      expect(await vcs.listWorktrees()).toEqual([]);
    });
  });
});

verifies("git.diff-between", () => {
  describe("diffBetween", () => {
    it("gives a diff for a file named beyond ASCII that applies as it is", async () => {
      const { vcs, head, files } = await repoWith({ "café.yaml": "1\n" });
      const worktree = await vcs.addWorktree(head);
      await new FolderDefinitionStore(worktree.path).write("café.yaml", "2\n");

      const [change] = await vcs.diffBetween(head, worktree.id);
      expect(change?.path).toBe("café.yaml");
      await vcs.applyPatch(String(change?.diff));
      expect(await files.read("café.yaml")).toBe("2\n");
    });

    it("leaves the worktree's own index as it was", async () => {
      const { vcs, folder, head } = await repoWith({ "a.yaml": "1\n" });
      const worktree = await vcs.addWorktree(head);
      await writeFiles(worktree.path, { "a.yaml": "2\n", "b.yaml": "new\n" });
      const index = join(recordOf(folder, worktree.id), "index");
      const before = await readFile(index);

      expect(await vcs.diffBetween(head, worktree.id)).toHaveLength(2);
      expect(await readFile(index)).toEqual(before);
      expect(await readdir(recordOf(folder, worktree.id))).not.toContainEqual(
        expect.stringMatching(/^halonic-diff-/u),
      );
    });
  });
});

/** A patch that changes `a.yaml`'s one line from `from` to `to`. */
function linePatch(from: string, to: string): string {
  return `diff --git a/a.yaml b/a.yaml\n--- a/a.yaml\n+++ b/a.yaml\n@@ -1 +1 @@\n-${from}\n+${to}\n`;
}

verifies("git.apply-patch", () => {
  describe("reading a patch before git applies it", () => {
    it("gives the paths its headers name", () => {
      expect(plainTextPatchPaths(linePatch("1", "2"))).toEqual(["a.yaml", "a.yaml", "a.yaml"]);
      const created = "diff --git a/b c.yaml b/b c.yaml\nnew file mode 100644\n";
      expect(plainTextPatchPaths(`${created}--- /dev/null\n+++ b/b c.yaml\t\n`)).toEqual([
        "b c.yaml",
        "b c.yaml",
      ]);
    });

    it.each([
      ["a gitlink edit", "diff --git a/s b/s\nindex 1111111..2222222 160000\n"],
      ["a link edit", "diff --git a/l b/l\nindex 1111111..2222222 120000\n"],
      ["a new file that can run", "diff --git a/x b/x\nnew file mode 100755\n"],
      ["two paths in one header", "diff --git a/a.yaml b/b.yaml\n"],
      ["a quoted path", 'diff --git "a/\\303\\251.yaml" "b/\\303\\251.yaml"\n'],
      ["a path with no prefix", "--- a.yaml\n+++ a.yaml\n"],
      ["a NUL in a path", "--- a/a\u0000b.yaml\n+++ b/a\u0000b.yaml\n"],
    ])("refuses %s", (_label, patch) => {
      expect(() => plainTextPatchPaths(patch)).toThrow(RangeError);
    });
  });

  describe("applyPatch", () => {
    it("applies the lines as written, whatever apply.whitespace the repository sets", async () => {
      const { vcs, folder, files } = await repoWith({ "a.yaml": "1\n" });
      await plainGit(folder, ["config", "--local", "apply.whitespace", "fix"]);
      await vcs.applyPatch(linePatch("1", "2  "));
      expect(await files.read("a.yaml")).toBe("2  \n");
      expect(await readdir(join(folder, ".git"))).not.toContainEqual(
        expect.stringMatching(/^halonic-patch-/u),
      );
    });
  });
});
