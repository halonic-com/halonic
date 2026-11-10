import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
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

verifies("memory.vcs-versions", () => {
  describe("snapshot", () => {
    it("commits the files on disk, new ones included, and changes nothing else", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      await files.write("b.yaml", "new\n");
      const before = { status: await vcs.status(), log: await vcs.log(5) };

      const snapshot = await vcs.snapshot();

      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("2\n");
      expect(await vcs.listAt(snapshot)).toEqual(["a.yaml", "b.yaml"]);
      expect(await vcs.status()).toEqual(before.status);
      expect(await vcs.log(5)).toEqual(before.log);
    });

    it("keeps what was on disk when the files change afterwards", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      const snapshot = await vcs.snapshot();
      await files.write("a.yaml", "3\n");
      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("2\n");
    });

    it("works before the first commit, and the branch still has none", async () => {
      const files = new MemoryDefinitionStore({ "a.yaml": "1\n" });
      const vcs = new MemoryVcs(files);
      await vcs.init();
      const snapshot = await vcs.snapshot();
      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("1\n");
      expect(await vcs.log(5)).toEqual([]);
    });

    it("fails when a file is removed while it is being read", async () => {
      /** A working tree that still lists a file another writer has just removed. */
      class StaleListing extends MemoryDefinitionStore {
        override async list(dir?: string): Promise<string[]> {
          return [...(await super.list(dir)), "gone.yaml"];
        }
      }
      const vcs = new MemoryVcs(new StaleListing({ "a.yaml": "1\n" }));
      await vcs.init();
      await expect(vcs.snapshot()).rejects.toThrow("gone.yaml was removed");
    });

    it("refuses a folder that isn't a repository", async () => {
      const vcs = new MemoryVcs(new MemoryDefinitionStore());
      await expect(vcs.snapshot()).rejects.toThrow("not a repository");
    });
  });

  describe("readAt and listAt", () => {
    it("read the commit, not the disk or the index", async () => {
      const { vcs, files } = await repoWith({ "agents/a.agent.yaml": "x\n" });
      const [commit] = await vcs.log(1);
      await files.write("agents/a.agent.yaml", "y\n");
      await vcs.stage(["agents/a.agent.yaml"]);
      expect(await vcs.readAt(commit?.hash ?? "", "agents/a.agent.yaml")).toBe("x\n");
    });

    it("give null for a file or folder the commit doesn't have", async () => {
      const { vcs } = await repoWith({ "agents/a.agent.yaml": "x\n", "w.workflow.yaml": "w\n" });
      const [commit] = await vcs.log(1);
      const version = commit?.hash ?? "";
      expect(await vcs.readAt(version, "b.yaml")).toBeNull();
      expect(await vcs.listAt(version, "missing")).toBeNull();
      expect(await vcs.listAt(version, "agents")).toEqual(["agents/a.agent.yaml"]);
    });

    it("refuse a version the repository doesn't have", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const unknown = "0".repeat(40);
      await expect(vcs.readAt(unknown, "a.yaml")).rejects.toThrow(`Unknown version ${unknown}`);
      await expect(vcs.listAt(unknown)).rejects.toThrow(`Unknown version ${unknown}`);
    });

    it("refuse a version that isn't a full commit id, and a private path", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const [commit] = await vcs.log(1);
      await expect(vcs.readAt("HEAD", "a.yaml")).rejects.toThrow(RangeError);
      await expect(vcs.listAt("main")).rejects.toThrow(RangeError);
      await expect(vcs.readAt(commit?.hash ?? "", ".env")).rejects.toThrow(RangeError);
    });
  });

  describe("rename", () => {
    it("moves a tracked file with its history: it shows as a staged rename", async () => {
      const { vcs, files } = await repoWith({ "agents/old.agent.yaml": "x\n" });
      await vcs.rename("agents/old.agent.yaml", "agents/new.agent.yaml");
      expect(await files.read("agents/old.agent.yaml")).toBeNull();
      expect(await files.read("agents/new.agent.yaml")).toBe("x\n");
      expect((await vcs.status()).changes).toEqual([
        {
          path: "agents/new.agent.yaml",
          status: "renamed",
          staged: true,
          from: "agents/old.agent.yaml",
        },
      ]);
    });

    it("moves an untracked file, which stays untracked", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("notes.md", "n\n");
      await vcs.rename("notes.md", "docs/notes.md");
      expect((await vcs.status()).changes).toEqual([
        { path: "docs/notes.md", status: "untracked", staged: false },
      ]);
    });

    it("moves every file under a folder", async () => {
      const { vcs, files } = await repoWith({ "hubs/p/a.yaml": "a\n", "hubs/p/b/c.yaml": "c\n" });
      await vcs.rename("hubs/p", "hubs/q");
      expect(await files.list()).toEqual(["hubs/q/a.yaml", "hubs/q/b/c.yaml"]);
    });

    it.each([
      ["a.yaml", "b.yaml", "already exists"],
      ["missing.yaml", "c.yaml", "no missing.yaml"],
      ["hubs", "hubs/inner", "into itself"],
    ])("refuses %s -> %s and changes nothing", async (from, to, message) => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n", "b.yaml": "2\n", "hubs/x": "x\n" });
      const before = { files: await files.list(), status: await vcs.status() };
      await expect(vcs.rename(from, to)).rejects.toThrow(message);
      expect(await files.list()).toEqual(before.files);
      expect(await vcs.status()).toEqual(before.status);
    });

    it("refuses a private path", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      await expect(vcs.rename("a.yaml", ".env")).rejects.toThrow(RangeError);
    });
  });
});
