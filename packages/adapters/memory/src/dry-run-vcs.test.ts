import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { DryRunVcs } from "./dry-run-vcs.ts";
import { unifiedDiff } from "./line-diff.ts";
import { MemoryVcs } from "./vcs.ts";

/** A repository with one commit holding `a.yaml`, and an unstaged change to it. */
async function changedRepository(): Promise<{ real: MemoryVcs; files: MemoryDefinitionStore }> {
  const files = new MemoryDefinitionStore({ "a.yaml": "1\n" });
  const real = new MemoryVcs(files);
  await real.init();
  await real.stage(["a.yaml"]);
  await real.commit("Initial commit");
  await files.write("a.yaml", "2\n");
  return { real, files };
}

/** Stands in for a git adapter, which refuses a path through a symbolic link. */
class LinkRefusingVcs extends MemoryVcs {
  override async diff(path: string, staged: boolean): Promise<string> {
    if (path.startsWith("link/")) throw new RangeError(`${path} goes through a link.`);
    return super.diff(path, staged);
  }
}

verifies("memory.dry-run-vcs", () => {
  it("records every change in order and leaves the repository as it was", async () => {
    const { real, files } = await changedRepository();
    const before = { status: await real.status(), log: await real.log(5) };
    const dryRun = new DryRunVcs(real);

    await dryRun.stage(["a.yaml"]);
    await dryRun.unstage(["a.yaml"]);
    await dryRun.stage(["a.yaml"]);
    expect(await dryRun.commit("Change a")).toBe("dry-run:commit-1");
    await dryRun.createBranch("feature");
    await dryRun.checkout("main");
    await dryRun.discard(["a.yaml"]);
    await dryRun.pull();
    await dryRun.push();

    expect(dryRun.changes()).toEqual([
      { kind: "stage", paths: ["a.yaml"] },
      { kind: "unstage", paths: ["a.yaml"] },
      { kind: "stage", paths: ["a.yaml"] },
      { kind: "commit", message: "Change a" },
      { kind: "createBranch", branch: "feature" },
      { kind: "checkout", branch: "main" },
      { kind: "discard", paths: ["a.yaml"] },
      { kind: "pull" },
      { kind: "push" },
    ]);
    expect(await real.status()).toEqual(before.status);
    expect(await real.log(5)).toEqual(before.log);
    expect(await real.branches()).toEqual(["main"]);
    expect(await files.read("a.yaml")).toBe("2\n");
  });

  it("reads the real repository, which doesn't show the recorded changes", async () => {
    const { real } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    await dryRun.stage(["a.yaml"]);
    expect(await dryRun.status()).toEqual(await real.status());
    expect(await dryRun.diff("a.yaml", false)).toBe(await real.diff("a.yaml", false));
    expect(await dryRun.log(5)).toEqual(await real.log(5));
    expect(await dryRun.branches()).toEqual(["main"]);
    expect(await dryRun.remotes()).toEqual([]);
  });

  it("keeps its record safe from callers", async () => {
    const { real } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    const paths = ["a.yaml"];
    await dryRun.stage(paths);
    paths.push("b.yaml");
    dryRun.changes().pop();
    expect(dryRun.changes()).toEqual([{ kind: "stage", paths: ["a.yaml"] }]);
    expect(Object.isFrozen(dryRun.changes()[0])).toBe(true);
  });

  it("refuses what the real repository would refuse from the input, and records nothing for it", async () => {
    const { files } = await changedRepository();
    const real = new LinkRefusingVcs(files);
    await real.init();
    const dryRun = new DryRunVcs(real);
    for (const path of ["../a.yaml", ".git/config", "link/a.yaml"]) {
      await expect(dryRun.stage([path]), path).rejects.toThrow(RangeError);
      await expect(dryRun.discard(["a.yaml", path]), path).rejects.toThrow(RangeError);
    }
    await expect(dryRun.checkout("-f")).rejects.toThrow(RangeError);
    await expect(dryRun.createBranch("@{-1}")).rejects.toThrow(RangeError);
    await expect(dryRun.commit("  ")).rejects.toThrow("empty");
    expect(dryRun.changes()).toEqual([]);
  });

  it("refuses changes to a folder that isn't a repository, until an init is recorded", async () => {
    const real = new MemoryVcs(new MemoryDefinitionStore({ "a.yaml": "1\n" }));
    const dryRun = new DryRunVcs(real);
    await expect(dryRun.stage(["a.yaml"])).rejects.toThrow("not a repository");
    await expect(dryRun.push()).rejects.toThrow("not a repository");

    await dryRun.init();
    await dryRun.stage(["a.yaml"]);
    await expect(dryRun.stage([".git/config"])).rejects.toThrow(RangeError);
    await dryRun.commit("First");
    expect(dryRun.changes().map((change) => change.kind)).toEqual(["init", "stage", "commit"]);
    expect((await real.status()).isRepo).toBe(false);
  });
});

verifies("memory.dry-run-vcs-versions", () => {
  it("records a rename and leaves the files where they are", async () => {
    const { real, files } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    await dryRun.rename("a.yaml", "b.yaml");
    expect(dryRun.changes()).toEqual([{ kind: "rename", from: "a.yaml", to: "b.yaml" }]);
    expect(await files.list()).toEqual(["a.yaml"]);
  });

  it("refuses a private path and a folder that isn't a repository, recording nothing", async () => {
    const { real } = await changedRepository();
    await expect(new DryRunVcs(real).rename("a.yaml", ".git/x")).rejects.toThrow(RangeError);
    const notRepo = new DryRunVcs(new MemoryVcs(new MemoryDefinitionStore({ "a.yaml": "1\n" })));
    await expect(notRepo.rename("a.yaml", "b.yaml")).rejects.toThrow("not a repository");
    expect(notRepo.changes()).toEqual([]);
  });

  it("reads snapshots and versions through", async () => {
    const { real } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    const snapshot = await dryRun.snapshot();
    expect(await dryRun.readAt(snapshot, "a.yaml")).toBe("2\n");
    expect(await dryRun.listAt(snapshot)).toEqual(["a.yaml"]);
    expect(dryRun.changes()).toEqual([]);
  });
});

verifies("memory.dry-run-vcs-worktrees", () => {
  it("records worktrees and patches, and changes nothing", async () => {
    const { real, files } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    const snapshot = await dryRun.snapshot();
    const patch = unifiedDiff("a.yaml", "2\n", "3\n");

    const worktree = await dryRun.addWorktree(snapshot);
    await dryRun.applyPatch(patch, { reverse: true });
    await dryRun.applyPatch(patch);
    await dryRun.removeWorktree(worktree.id);

    expect(worktree).toEqual({
      id: "dry-run:worktree-1",
      path: "dry-run:worktree-1",
      version: snapshot,
    });
    expect(dryRun.changes()).toEqual([
      { kind: "addWorktree", version: snapshot },
      { kind: "applyPatch", patch, reverse: true },
      { kind: "applyPatch", patch, reverse: false },
      { kind: "removeWorktree", id: "dry-run:worktree-1" },
    ]);
    expect(await dryRun.listWorktrees()).toEqual([]);
    expect(await files.read("a.yaml")).toBe("2\n");
  });

  it("reads a real worktree's changes through", async () => {
    const { real } = await changedRepository();
    const snapshot = await real.snapshot();
    const worktree = await real.addWorktree(snapshot);
    await real.worktreeFiles(worktree.id).write("a.yaml", "3\n");
    const dryRun = new DryRunVcs(real);
    expect(await dryRun.listWorktrees()).toEqual([worktree]);
    expect(await dryRun.diffBetween(snapshot, worktree.id)).toEqual(
      await real.diffBetween(snapshot, worktree.id),
    );
  });

  it("refuses an unknown version and a patch to a private path, recording nothing", async () => {
    const { real } = await changedRepository();
    const dryRun = new DryRunVcs(real);
    await expect(dryRun.addWorktree("HEAD")).rejects.toThrow(RangeError);
    await expect(dryRun.addWorktree("0".repeat(40))).rejects.toThrow("Unknown version");
    await expect(dryRun.applyPatch(unifiedDiff(".env", null, "KEY=x\n"))).rejects.toThrow(
      RangeError,
    );
    await expect(dryRun.applyPatch("not a patch")).rejects.toThrow(RangeError);
    expect(dryRun.changes()).toEqual([]);
  });
});
