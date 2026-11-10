import { expect, it } from "vitest";
import type { MakeVcs, VcsHarness } from "./vcs-harness.ts";
import { commitHash, stagedDiffs, stateOf } from "./vcs-helpers.ts";
import { invalidProposalRefs, validProposalRefs } from "./vcs-proposal-inputs.ts";
import { invalidCommitRefs, privateWorkspaceFiles, unknownCommit } from "./vcs-version-inputs.ts";

/** The proposal ref most cases use. */
const ref = "refs/halonic/proposals/run-1";

/**
 * The {@link Vcs} contract's cases for proposal refs (port version 2, plan
 * point 9): a run's worktree is committed onto a hidden ref,
 * `refs/halonic/proposals/<id>`, which can be read and deleted, and which no
 * branch, HEAD, index or working tree ever notices.
 */
export function vcsProposalRefCases(make: MakeVcs): void {
  commitCases(make);
  parentAndPrivateCases(make);
  refCases(make);
  refusalCases(make);
}

/** Everything a proposal must leave as it was: the workspace's state, its index, its branches and the worktrees. */
async function workspaceOf(harness: VcsHarness, paths: readonly string[]) {
  const { vcs } = harness;
  return {
    state: await stateOf(harness),
    staged: await stagedDiffs(harness, paths),
    branches: await vcs.branches(),
    worktrees: await vcs.listWorktrees(),
  };
}

function commitCases(make: MakeVcs): void {
  it("commits a worktree's files onto a proposal ref, on its parent, and changes nothing else", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", "c.yaml": "1\n" });
    const { vcs, files } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const inWorktree = harness.worktreeFiles(worktree);
    await inWorktree.write("a.yaml", "from the run\n");
    await inWorktree.remove("b.yaml");
    await inWorktree.write("d.yaml", "new\n");
    // The workspace has changes of its own, staged and not, that a proposal leaves alone.
    await files.write("a.yaml", "2\n");
    await vcs.stage(["a.yaml"]);
    await files.write("c.yaml", "2\n");
    const before = await workspaceOf(harness, ["a.yaml", "b.yaml", "c.yaml"]);

    const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });
    expect(proposal).toMatch(commitHash);
    expect(await vcs.readRef(ref)).toBe(proposal);
    expect(await harness.parentsOf(proposal)).toEqual([snapshot]);
    expect(await vcs.listAt(proposal)).toEqual(["a.yaml", "c.yaml", "d.yaml"]);
    expect(await vcs.readAt(proposal, "a.yaml")).toBe("from the run\n");
    expect(await vcs.readAt(proposal, "d.yaml")).toBe("new\n");

    // HEAD, the branches, the index, the working tree and the worktree are as they were.
    expect(await workspaceOf(harness, ["a.yaml", "b.yaml", "c.yaml"])).toEqual(before);
    expect(await inWorktree.list()).toEqual(["a.yaml", "c.yaml", "d.yaml"]);
    expect(await vcs.diffBetween(proposal, worktree.id)).toEqual([]);
  });
}

function parentAndPrivateCases(make: MakeVcs): void {
  it("takes any commit as the parent, not only the worktree's own", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const [head] = await vcs.log(1);
    if (head === undefined) throw new Error("The repository has no commit.");
    await harness.files.write("a.yaml", "2\n");
    const worktree = await vcs.addWorktree(await vcs.snapshot());

    const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: head.hash });
    expect(await harness.parentsOf(proposal)).toEqual([head.hash]);
    expect(await vcs.readAt(proposal, "a.yaml")).toBe("2\n");
  });

  it("leaves private entries out of a proposal, even those HEAD tracks", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    await harness.commitPrivate(".env", "KEY=1\n");
    const [head] = await vcs.log(1);
    if (head === undefined) throw new Error("The repository has no commit.");
    const worktree = await vcs.addWorktree(head.hash);
    for (const [path, content] of Object.entries(privateWorkspaceFiles)) {
      await harness.writePrivate(worktree, path, content);
    }
    await harness.worktreeFiles(worktree).write("a.yaml", "2\n");

    const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: head.hash });
    expect(await harness.privateAt(proposal)).toEqual([]);
    expect(await vcs.listAt(proposal)).toEqual(["a.yaml"]);
    expect(await harness.readPrivate(".env")).toBe("KEY=1\n");
  });

  it("takes every ref the rule allows", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    for (const each of validProposalRefs) {
      const proposal = await vcs.commitWorktreeTo(worktree.id, each, { parent: snapshot });
      expect(await vcs.readRef(each), each).toBe(proposal);
    }
    expect(await vcs.branches()).toEqual(["main"]);
  });
}

function refCases(make: MakeVcs): void {
  it("refuses a ref that already exists, and keeps the first proposal", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    await harness.worktreeFiles(worktree).write("a.yaml", "first\n");
    const first = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });

    await harness.worktreeFiles(worktree).write("a.yaml", "second\n");
    await expect(vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot })).rejects.toThrow();
    expect(await vcs.readRef(ref)).toBe(first);
    expect(await vcs.readAt(first, "a.yaml")).toBe("first\n");
  });

  it("reads a missing ref as null, and deletes a ref only once", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    expect(await vcs.readRef(ref)).toBeNull();
    await expect(vcs.deleteRef(ref)).rejects.toThrow();

    await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });
    const before = await workspaceOf(harness, ["a.yaml"]);
    await vcs.deleteRef(ref);
    expect(await vcs.readRef(ref)).toBeNull();
    await expect(vcs.deleteRef(ref)).rejects.toThrow();
    expect(await workspaceOf(harness, ["a.yaml"])).toEqual(before);

    // The ref is free again: a new proposal can take it.
    const again = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });
    expect(await vcs.readRef(ref)).toBe(again);
  });

  it("never takes a branch named like a proposal ref for one", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    // git takes this branch name, and `git rev-parse` would then resolve the
    // missing proposal ref to it. An adapter may refuse the name instead.
    const madeBranch = await vcs.createBranch(ref).then(
      () => true,
      () => false,
    );
    if (madeBranch) await vcs.checkout("main");
    const branches = await vcs.branches();

    expect(await vcs.readRef(ref)).toBeNull();
    await expect(vcs.deleteRef(ref)).rejects.toThrow();
    expect(await vcs.branches()).toEqual(branches);
  });
}

function refusalCases(make: MakeVcs): void {
  it("refuses every ref that isn't a proposal ref, in every method, and changes nothing", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    await harness.worktreeFiles(worktree).write("a.yaml", "2\n");
    await harness.files.write("a.yaml", "3\n");
    const before = await workspaceOf(harness, ["a.yaml"]);

    for (const each of invalidProposalRefs) {
      const label = JSON.stringify(each);
      await expect(
        vcs.commitWorktreeTo(worktree.id, each, { parent: snapshot }),
        label,
      ).rejects.toThrow(RangeError);
      await expect(vcs.readRef(each), label).rejects.toThrow(RangeError);
      await expect(vcs.deleteRef(each), label).rejects.toThrow(RangeError);
    }
    expect(await workspaceOf(harness, ["a.yaml"])).toEqual(before);
  });

  it("refuses a parent that isn't a full commit id, and creates no ref", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const before = await workspaceOf(harness, ["a.yaml"]);

    for (const parent of [...invalidCommitRefs, ...(await harness.nonCommitIds(snapshot))]) {
      const label = JSON.stringify(parent);
      await expect(vcs.commitWorktreeTo(worktree.id, ref, { parent }), label).rejects.toThrow(
        RangeError,
      );
    }
    await expect(vcs.commitWorktreeTo(worktree.id, ref, { parent: unknownCommit })).rejects.toThrow(
      /Unknown version/,
    );
    expect(await vcs.readRef(ref)).toBeNull();
    expect(await workspaceOf(harness, ["a.yaml"])).toEqual(before);
  });

  it("refuses a worktree id it didn't give, and creates no ref", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    const before = await workspaceOf(harness, ["a.yaml"]);

    for (const id of ["", ".", "..", "../x", "/x", "-x", "missing", worktree.path]) {
      if (id === worktree.id) continue;
      await expect(
        vcs.commitWorktreeTo(id, ref, { parent: snapshot }),
        JSON.stringify(id),
      ).rejects.toThrow();
    }
    expect(await vcs.readRef(ref)).toBeNull();
    expect(await workspaceOf(harness, ["a.yaml"])).toEqual(before);
  });
}
