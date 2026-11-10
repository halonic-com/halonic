import { expect, it } from "vitest";
import { type MakeVcs, optionLikePaths, patternLikePaths, unsafeVcsPaths } from "./vcs-harness.ts";
import { changesOf, stateOf } from "./vcs-helpers.ts";
import { deletePatch, linePatch } from "./vcs-patch-inputs.ts";
import { vcsPatchSafetyCases } from "./vcs-patch-safety.ts";
import { patternLikeIt } from "./vcs-safety.ts";
import { invalidCommitRefs, privateWorkspaceFiles, unknownCommit } from "./vcs-version-inputs.ts";

/**
 * The safety part of the {@link Vcs} contract for port version 2: worktrees
 * live outside the workspace folder, a patch is applied whole or not at all
 * and never reaches a path the port refuses, private entries never get into
 * a version, and a version is only ever a full commit id.
 */
export function vcsVersionSafetyCases(make: MakeVcs): void {
  worktreeFolderCases(make);
  privateEntryCases(make);
  trackedPrivateEntryCases(make);
  versionCases(make);
  nonCommitIdCases(make);
  worktreeIdCases(make);
  pathCases(make);
  vcsPatchSafetyCases(make);
}

/** Whether `path` is `folder` or inside it, in any case and with either separator. */
function isInside(path: string, folder: string): boolean {
  const normal = (each: string) => each.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
  const [inner, outer] = [normal(path), normal(folder)];
  return inner === outer || inner.startsWith(`${outer}/`);
}

function worktreeFolderCases(make: MakeVcs): void {
  it("adds every worktree outside the workspace folder", async () => {
    const { vcs, files } = await make.repo({ "a.yaml": "1\n" });
    const snapshot = await vcs.snapshot();
    const added = [await vcs.addWorktree(snapshot), await vcs.addWorktree(snapshot)];
    for (const worktree of [...added, ...(await vcs.listWorktrees())]) {
      expect(isInside(worktree.path, files.location), worktree.path).toBe(false);
    }
    // Nor does a worktree show in the workspace's files or status.
    expect(await files.list()).toEqual(["a.yaml"]);
    expect((await vcs.status()).changes).toEqual([]);
  });
}

function privateEntryCases(make: MakeVcs): void {
  it("leaves private entries out of a snapshot, and never reads or lists them at a version", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", ...privateWorkspaceFiles });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    expect(await vcs.listAt(snapshot)).toEqual(["a.yaml"]);
    for (const path of Object.keys(privateWorkspaceFiles)) {
      await expect(vcs.readAt(snapshot, path), path).rejects.toThrow(RangeError);
    }
    await expect(vcs.listAt(snapshot, ".studio")).rejects.toThrow(RangeError);
  });

  it("adds a worktree at a snapshot without the private entries, so it has no changes", async () => {
    const { vcs } = await make.repo({ "a.yaml": "1\n", ...privateWorkspaceFiles });
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    expect(await vcs.diffBetween(snapshot, worktree.id)).toEqual([]);
  });

  it("leaves a private entry written in a worktree out of its changes", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    for (const [path, content] of Object.entries(privateWorkspaceFiles)) {
      await harness.writePrivate(worktree, path, content);
    }
    await harness.worktreeFiles(worktree).write("a.yaml", "2\n");
    const changes = await vcs.diffBetween(snapshot, worktree.id);
    expect(changes.map(({ path, status }) => ({ path, status }))).toEqual([
      { path: "a.yaml", status: "modified" },
    ]);
    expect(changes.map((change) => change.diff).join("")).not.toContain("KEY=");
  });
}

function trackedPrivateEntryCases(make: MakeVcs): void {
  it("leaves a private entry HEAD tracks out of a snapshot, and never reads it at HEAD", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    await harness.commitPrivate(".env", "KEY=1\n");
    const [head] = await vcs.log(1);
    if (head === undefined) throw new Error("The repository has no commit.");
    expect(await vcs.listAt(await vcs.snapshot())).toEqual(["a.yaml"]);
    expect(await vcs.listAt(head.hash)).toEqual(["a.yaml"]);
    await expect(vcs.readAt(head.hash, ".env")).rejects.toThrow(RangeError);
    expect(await harness.readPrivate(".env")).toBe("KEY=1\n");
  });

  it("never lists a private entry HEAD tracks as changed, and never lets a patch change it", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    await harness.commitPrivate(".env", "KEY=1\n");
    await harness.commitPrivate(".env.local", "KEY=2\n");
    const [head] = await vcs.log(1);
    if (head === undefined) throw new Error("The repository has no commit.");
    const snapshot = await vcs.snapshot();

    // The snapshot leaves them out, so against HEAD they would show as deleted:
    // applying that diff would delete the person's `.env`.
    const atSnapshot = await vcs.addWorktree(snapshot);
    expect(await vcs.diffBetween(head.hash, atSnapshot.id)).toEqual([]);
    const atHead = await vcs.addWorktree(head.hash);
    await harness.writePrivate(atHead, ".env", "KEY=changed\n");
    await harness.worktreeFiles(atHead).write("a.yaml", "2\n");
    const changes = await vcs.diffBetween(head.hash, atHead.id);
    expect(changes.map(({ path, status }) => ({ path, status }))).toEqual([
      { path: "a.yaml", status: "modified" },
    ]);
    expect(changes.map((change) => change.diff).join("")).not.toContain("KEY=");

    const before = await stateOf(harness);
    for (const patch of [deletePatch(".env", "KEY=1"), linePatch(".env.local", "KEY=2", "KEY=3")]) {
      await expect(vcs.applyPatch(patch, { reverse: false })).rejects.toThrow(RangeError);
    }
    expect(await harness.readPrivate(".env")).toBe("KEY=1\n");
    expect(await harness.readPrivate(".env.local")).toBe("KEY=2\n");
    expect(await stateOf(harness)).toEqual(before);
  });
}

function versionCases(make: MakeVcs): void {
  it("refuses every version that isn't a full commit id in readAt and listAt, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    await harness.files.write("a.yaml", "2\n");
    const before = await stateOf(harness);

    for (const ref of invalidCommitRefs) {
      const label = JSON.stringify(ref);
      await expect(vcs.readAt(ref, "a.yaml"), label).rejects.toThrow(RangeError);
      await expect(vcs.listAt(ref), label).rejects.toThrow(RangeError);
      await expect(vcs.listAt(ref, "agents"), label).rejects.toThrow(RangeError);
    }
    expect(await stateOf(harness)).toEqual(before);
  });

  it("refuses every version that isn't a full commit id in the worktree methods, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const worktree = await vcs.addWorktree(await vcs.snapshot());
    await harness.files.write("a.yaml", "2\n");
    const before = await stateOf(harness);

    for (const ref of invalidCommitRefs) {
      const label = JSON.stringify(ref);
      await expect(vcs.addWorktree(ref), label).rejects.toThrow(RangeError);
      await expect(vcs.diffBetween(ref, worktree.id), label).rejects.toThrow(RangeError);
    }
    await expect(vcs.addWorktree(unknownCommit)).rejects.toThrow(/Unknown version/);
    await expect(vcs.diffBetween(unknownCommit, worktree.id)).rejects.toThrow(/Unknown version/);
    expect(await vcs.listWorktrees()).toEqual([worktree]);
    expect(await stateOf(harness)).toEqual(before);
  });
}

function nonCommitIdCases(make: MakeVcs): void {
  // `drivesGit` can't tell real git in these two: the memory suite sets it to
  // check the hardened cases, and memory has no trees or blobs. So the git
  // adapter's own tests check its harness gives a tree and a blob.
  it("refuses a full id that names a tree or a file in readAt and listAt, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "agents/b.yaml": "1\n" });
    const { vcs } = harness;
    const ids = await harness.nonCommitIds(await vcs.snapshot());
    const before = await stateOf(harness);

    for (const id of ids) {
      await expect(vcs.readAt(id, "a.yaml"), id).rejects.toThrow(RangeError);
      await expect(vcs.listAt(id), id).rejects.toThrow(RangeError);
      await expect(vcs.listAt(id, "agents"), id).rejects.toThrow(RangeError);
    }
    expect(await stateOf(harness)).toEqual(before);
  });

  it("refuses a full id that names a tree or a file in the worktree methods, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "agents/b.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const ids = await harness.nonCommitIds(snapshot);
    const before = await stateOf(harness);

    for (const id of ids) {
      await expect(vcs.addWorktree(id), id).rejects.toThrow(RangeError);
      await expect(vcs.diffBetween(id, worktree.id), id).rejects.toThrow(RangeError);
    }
    expect(await vcs.listWorktrees()).toEqual([worktree]);
    expect(await stateOf(harness)).toEqual(before);
  });
}

function worktreeIdCases(make: MakeVcs): void {
  it("reads a worktree id only as an id it gave, never as a path or an option", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const before = await stateOf(harness);
    for (const id of ["", ".", "..", "../x", "/x", "-x", "--force", worktree.path]) {
      if (id === worktree.id) continue;
      await expect(vcs.removeWorktree(id), JSON.stringify(id)).rejects.toThrow();
      await expect(vcs.diffBetween(snapshot, id), JSON.stringify(id)).rejects.toThrow();
    }
    expect(await vcs.listWorktrees()).toEqual([worktree]);
    expect(await stateOf(harness)).toEqual(before);
  });
}

function pathCases(make: MakeVcs): void {
  it("refuses an unsafe path in readAt, listAt and rename, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    await harness.files.write("b.yaml", "new\n");
    const before = await stateOf(harness);

    for (const path of unsafeVcsPaths) {
      const label = JSON.stringify(path);
      await expect(vcs.readAt(snapshot, path), label).rejects.toThrow(RangeError);
      await expect(vcs.listAt(snapshot, path), label).rejects.toThrow(RangeError);
      await expect(vcs.rename(path, "c.yaml"), label).rejects.toThrow(RangeError);
      await expect(vcs.rename("a.yaml", path), label).rejects.toThrow(RangeError);
      await expect(vcs.rename("b.yaml", path), label).rejects.toThrow(RangeError);
    }
    expect(await stateOf(harness)).toEqual(before);
  });

  for (const path of [...optionLikePaths, ...patternLikePaths]) {
    const name = `renames the tracked file ${JSON.stringify(path)} as a file, never an option or a pattern`;
    patternLikeIt(make, path, name, async () => {
      const { vcs, files } = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", [path]: "x\n" });
      await vcs.rename(path, "renamed.yaml");
      expect((await files.list()).sort()).toEqual(["a.yaml", "b.yaml", "renamed.yaml"]);
      expect(await files.read("renamed.yaml")).toBe("x\n");
      expect(await changesOf(vcs.status())).toEqual([
        { path: "renamed.yaml", status: "renamed", staged: true, from: path },
      ]);
    });
  }
}
