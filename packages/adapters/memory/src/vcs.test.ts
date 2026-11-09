import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { unifiedDiff } from "./line-diff.ts";
import { MemoryVcs } from "./vcs.ts";
import {
  commitOf,
  headCommit,
  MemoryRemote,
  newRepository,
  remoteOf,
  trackedCommit,
} from "./vcs-repository.ts";

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

verifies("memory.vcs", () => {
  describe("a repository with no commits", () => {
    it("has an empty log, and a branch made from it has no commits either", async () => {
      const vcs = new MemoryVcs(new MemoryDefinitionStore());
      await vcs.init();
      expect(await vcs.log(5)).toEqual([]);
      await vcs.createBranch("feature");
      expect(await vcs.log(5)).toEqual([]);
    });

    it("refuses to push", async () => {
      const vcs = new MemoryVcs(new MemoryDefinitionStore());
      await vcs.init();
      vcs.addRemote("origin", new MemoryRemote());
      await expect(vcs.push()).rejects.toThrow("no commits");
    });
  });

  it("changes nothing when init runs on a repository", async () => {
    const { vcs } = await repoWith({ "a.yaml": "1\n" });
    const [before] = await vcs.log(1);
    await vcs.init();
    expect(await vcs.log(5)).toEqual([before]);
  });

  it("refuses to clone a branch the remote doesn't have", async () => {
    await expect(
      MemoryVcs.clone(new MemoryRemote(), new MemoryDefinitionStore(), { branch: "develop" }),
    ).rejects.toThrow("no branch develop");
  });

  it("refuses to pull when the remote has lost the upstream branch", async () => {
    const remote = new MemoryRemote();
    const { vcs } = await repoWith({ "a.yaml": "1\n" });
    vcs.addRemote("origin", remote);
    await vcs.push();
    const clone = await MemoryVcs.clone(remote, new MemoryDefinitionStore());
    remote.branches.delete("main");
    await expect(clone.pull()).rejects.toThrow("no branch main");
  });

  describe("switching commits", () => {
    it("refuses over an unstaged change to a tracked file, and keeps it", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await vcs.createBranch("feature");
      await files.write("a.yaml", "2\n");
      await expect(vcs.checkout("main")).rejects.toThrow("Commit or discard");
      expect(await files.read("a.yaml")).toBe("2\n");
    });

    it("refuses over a staged change", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await vcs.createBranch("feature");
      await files.write("b.yaml", "new\n");
      await vcs.stage(["b.yaml"]);
      await expect(vcs.checkout("main")).rejects.toThrow("Commit or discard");
    });

    it("removes files the target commit doesn't have", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await vcs.createBranch("feature");
      await files.write("b.yaml", "new\n");
      await vcs.stage(["b.yaml"]);
      await vcs.commit("Add b");
      await vcs.checkout("main");
      expect(await files.list()).toEqual(["a.yaml"]);
    });
  });

  describe("the repository helpers", () => {
    it("give no head commit before the first commit, and no tracked commit before a pull", () => {
      const repo = newRepository("main");
      expect(headCommit(repo)).toBeNull();
      expect(trackedCommit(repo, "origin/main")).toBeNull();
    });

    it("refuse a remote or a commit the repository doesn't have", () => {
      const repo = newRepository("main");
      expect(() => remoteOf(repo, "origin")).toThrow("no remote origin");
      expect(() => commitOf(repo.commits, "abc")).toThrow("Missing commit abc");
    });
  });

  it("diffs a last line without a newline like any other line", () => {
    expect(unifiedDiff("a.yaml", "one\ntwo", "one\nthree")).toBe(
      [
        "diff --git a/a.yaml b/a.yaml",
        "--- a/a.yaml",
        "+++ b/a.yaml",
        "@@ -1,2 +1,2 @@",
        " one",
        "-two",
        "+three",
        "",
      ].join("\n"),
    );
  });
});
