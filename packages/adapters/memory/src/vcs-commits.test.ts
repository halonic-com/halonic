import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { MemoryVcs } from "./vcs.ts";

const ref = "refs/halonic/proposals/run-1";

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

verifies("memory.vcs-commits", () => {
  describe("commitVersion", () => {
    it("commits the changes in scope and keeps the ones left out at HEAD", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n", "b.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      await files.write("b.yaml", "2\n");

      const version = await vcs.commitVersion({ message: "Create version", exclude: ["b.yaml"] });

      expect(await vcs.readAt(version, "a.yaml")).toBe("2\n");
      expect(await vcs.readAt(version, "b.yaml")).toBe("1\n");
      expect((await vcs.status()).changes).toEqual([
        { path: "b.yaml", status: "modified", staged: false },
      ]);
      expect(await files.read("b.yaml")).toBe("2\n");
    });

    it("keeps a private entry HEAD tracks as HEAD has it", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await vcs.commitPrivate(".env", "KEY=1\n");
      files.writePrivate(".env", "KEY=2\n");
      await files.write("a.yaml", "2\n");

      const version = await vcs.commitVersion({ message: "Create version", exclude: [] });

      expect(vcs.commitDetails(version).paths).toEqual([".env", "a.yaml"]);
      expect((await vcs.status()).changes).toEqual([]);
    });

    it("leaves the review records out, whatever .gitignore says", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n", ".halonic/review/b.json": "{}\n" });
      await files.write("a.yaml", "2\n");
      await files.write(".halonic/review/b.json", '{"changed":true}\n');
      await files.write(".halonic/review/c.json", "{}\n");
      await files.write(".halonic/notes.md", "kept\n");

      const version = await vcs.commitVersion({ message: "Create version", exclude: [] });

      expect(await vcs.listAt(version)).toEqual([
        ".halonic/notes.md",
        ".halonic/review/b.json",
        "a.yaml",
      ]);
      expect(await vcs.readAt(version, ".halonic/review/b.json")).toBe("{}\n");
    });

    it("refuses an empty include or message, and a version with no change", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      const [before] = await vcs.log(1);
      await expect(vcs.commitVersion({ message: "x", include: [], exclude: [] })).rejects.toThrow(
        RangeError,
      );
      await files.write("a.yaml", "2\n");
      await expect(vcs.commitVersion({ message: " ", exclude: [] })).rejects.toThrow(/empty/);
      await expect(vcs.commitVersion({ message: "x", exclude: ["a.yaml"] })).rejects.toThrow(
        /Nothing to commit/,
      );
      expect(await vcs.log(1)).toEqual([before]);
    });
  });

  describe("proposal refs", () => {
    it("commits a worktree on its parent, apart from the branches", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const snapshot = await vcs.snapshot();
      const worktree = await vcs.addWorktree(snapshot);
      await vcs.worktreeFiles(worktree.id).write("a.yaml", "2\n");

      const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });

      expect(await vcs.readRef(ref)).toBe(proposal);
      expect(vcs.commitDetails(proposal).parents).toEqual([snapshot]);
      expect(await vcs.readAt(proposal, "a.yaml")).toBe("2\n");
      expect(await vcs.branches()).toEqual(["main"]);
    });

    it("refuses an existing ref, and deleting a missing one", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const snapshot = await vcs.snapshot();
      const worktree = await vcs.addWorktree(snapshot);
      const first = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });

      await vcs.worktreeFiles(worktree.id).write("a.yaml", "2\n");
      await expect(vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot })).rejects.toThrow(
        /already exists/,
      );
      expect(await vcs.readRef(ref)).toBe(first);
      await vcs.deleteRef(ref);
      await expect(vcs.deleteRef(ref)).rejects.toThrow(/no ref/);
    });
  });
});
