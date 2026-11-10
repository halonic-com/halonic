import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { unifiedDiff } from "./line-diff.ts";
import { MemoryVcs } from "./vcs.ts";

/** A repository with one commit holding `files`. */
async function repoWith(files: Record<string, string>): Promise<{
  vcs: MemoryVcs;
  files: MemoryDefinitionStore;
}> {
  const store = new MemoryDefinitionStore(files);
  const vcs = new MemoryVcs(store);
  await vcs.init();
  await vcs.stage(await store.list());
  await vcs.commit("Initial commit");
  return { vcs, files: store };
}

verifies("memory.vcs-worktrees", () => {
  describe("worktrees", () => {
    it("hold the version's files and change apart from the workspace", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      const snapshot = await vcs.snapshot();

      const worktree = await vcs.addWorktree(snapshot);
      await vcs.worktreeFiles(worktree.id).write("a.yaml", "3\n");

      expect(worktree).toEqual({
        id: "worktree-1",
        path: "memory:worktrees/worktree-1",
        version: snapshot,
      });
      expect(await files.read("a.yaml")).toBe("2\n");
      expect(await vcs.listWorktrees()).toEqual([worktree]);
    });

    it("are removed, and an unknown id is refused", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const worktree = await vcs.addWorktree(await vcs.snapshot());
      await vcs.removeWorktree(worktree.id);
      expect(await vcs.listWorktrees()).toEqual([]);
      await expect(vcs.removeWorktree(worktree.id)).rejects.toThrow("Unknown worktree worktree-1");
    });

    it("refuse a version that isn't a full commit id", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      await expect(vcs.addWorktree("HEAD")).rejects.toThrow(RangeError);
      await expect(vcs.diffBetween("HEAD", "worktree-1")).rejects.toThrow(RangeError);
    });

    it("refuse a folder that isn't a repository, even to list them", async () => {
      const vcs = new MemoryVcs(new MemoryDefinitionStore());
      await expect(vcs.listWorktrees()).rejects.toThrow("not a repository");
      await expect(vcs.removeWorktree("worktree-1")).rejects.toThrow("not a repository");
    });
  });

  it("lists what a worktree added, changed and deleted, sorted, with diffs", async () => {
    const { vcs, files } = await repoWith({ "a.yaml": "1\n", "c.yaml": "c\n", "d.yaml": "d\n" });
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const changed = vcs.worktreeFiles(worktree.id);
    await changed.write("a.yaml", "2\n");
    await changed.write("b.yaml", "b\n");
    await changed.remove("c.yaml");

    expect(await vcs.diffBetween(snapshot, worktree.id)).toEqual([
      { path: "a.yaml", status: "modified", diff: unifiedDiff("a.yaml", "1\n", "2\n") },
      { path: "b.yaml", status: "added", diff: unifiedDiff("b.yaml", null, "b\n") },
      { path: "c.yaml", status: "deleted", diff: unifiedDiff("c.yaml", "c\n", null) },
    ]);
    expect(await files.list()).toEqual(["a.yaml", "c.yaml", "d.yaml"]);
  });

  it("never brings a private entry HEAD tracks into a worktree, a diff or the status", async () => {
    const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
    files.writePrivate(".env", "KEY=1\n");
    const head = await vcs.commitPrivate(".env", "KEY=1\n");
    const worktree = await vcs.addWorktree(head);
    const changed = vcs.worktreeFiles(worktree.id);
    expect(changed.snapshot()).toEqual({ "a.yaml": "1\n" });

    changed.writePrivate(".env", "KEY=2\n");
    await changed.write("a.yaml", "2\n");
    const diffs = await vcs.diffBetween(head, worktree.id);
    expect(diffs.map(({ path, status }) => ({ path, status }))).toEqual([
      { path: "a.yaml", status: "modified" },
    ]);
    expect((await vcs.status()).changes).toEqual([]);
  });

  it("refuses to write or commit a path that isn't private through the test hooks", async () => {
    const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
    expect(() => files.writePrivate("a.yaml", "2\n")).toThrow(RangeError);
    await expect(vcs.commitPrivate("a.yaml", "2\n")).rejects.toThrow(RangeError);
    expect(files.snapshot()).toEqual({ "a.yaml": "1\n" });
  });

  describe("applyPatch", () => {
    it("applies a patch to the working tree only, and reverses it", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      const patch = unifiedDiff("a.yaml", "1\n", "2\n");
      await vcs.applyPatch(patch);
      expect(await files.read("a.yaml")).toBe("2\n");
      expect((await vcs.status()).changes).toEqual([
        { path: "a.yaml", status: "modified", staged: false },
      ]);
      await vcs.applyPatch(patch, { reverse: true });
      expect(await files.read("a.yaml")).toBe("1\n");
    });

    it("creates and deletes files", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await vcs.applyPatch(
        `${unifiedDiff("a.yaml", "1\n", null)}${unifiedDiff("b.yaml", null, "b\n")}`,
      );
      expect(await files.list()).toEqual(["b.yaml"]);
    });

    it("changes nothing when one file of the patch doesn't match", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n", "b.yaml": "edited\n" });
      const patch = `${unifiedDiff("a.yaml", "1\n", "2\n")}${unifiedDiff("b.yaml", "b\n", "B\n")}`;
      await expect(vcs.applyPatch(patch)).rejects.toThrow("The change no longer matches the file.");
      expect(await files.read("a.yaml")).toBe("1\n");
    });

    it("refuses a private or unsafe path and changes nothing", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      const toConfig = `${unifiedDiff("a.yaml", "1\n", "2\n")}${unifiedDiff(".git/config", null, "x\n")}`;
      await expect(vcs.applyPatch(toConfig)).rejects.toThrow(RangeError);
      await expect(vcs.applyPatch(unifiedDiff("../outside.yaml", null, "x\n"))).rejects.toThrow(
        RangeError,
      );
      expect(await files.list()).toEqual(["a.yaml"]);
      expect(await files.read("a.yaml")).toBe("1\n");
    });

    it("refuses a folder that isn't a repository", async () => {
      const vcs = new MemoryVcs(new MemoryDefinitionStore());
      await expect(vcs.applyPatch(unifiedDiff("a.yaml", null, "1\n"))).rejects.toThrow(
        "not a repository",
      );
    });
  });
});
