import { expect, it } from "vitest";
import { type HardenedTest, plantLocalConfig, plantOf } from "./vcs-hardened.ts";
import { type MakeVcs, plantedHooks } from "./vcs-harness.ts";

/**
 * The hardened cases for Create version and proposal refs (port version 2,
 * plan points 8 and 9): committing, writing and deleting refs run no hook,
 * signing program or filter planted in the repository, and a worktree's own
 * `.git` file is never trusted. `test` is as for `vcsHardenedCases`.
 */
export function vcsCommitsHardenedCases(make: MakeVcs, test: HardenedTest = it): void {
  if (!make.drivesGit) {
    test("runs no git, so it offers nothing to plant for a version or a proposal", async () => {
      expect((await make.repo({ "a.yaml": "1\n" })).plant).toBeUndefined();
    });
    return;
  }
  commitCases(make, test);
  worktreeGitFileCases(make, test);
}

function commitCases(make: MakeVcs, test: HardenedTest): void {
  test("never runs planted code when creating a version or a proposal", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", "c.yaml": "1\n" });
    const plant = plantOf(harness);
    // `reference-transaction` runs on every ref update; `post-index-change` on the index.
    for (const hook of plantedHooks) await plant.hook(hook);
    await plantLocalConfig(plant);
    const { vcs, files } = harness;
    const ref = "refs/halonic/proposals/run-1";

    await files.write("a.yaml", "2\n");
    await files.write("b.yaml", "2\n");
    await files.remove("c.yaml");
    await files.write("d.yaml", "new\n");
    const version = await vcs.commitVersion({ message: "Create version", exclude: ["b.yaml"] });
    const worktree = await vcs.addWorktree(version);
    await harness.worktreeFiles(worktree).write("a.yaml", "from the run\n");
    const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: version });
    await vcs.readRef(ref);
    await vcs.readAt(proposal, "a.yaml");
    await vcs.deleteRef(ref);
    await vcs.removeWorktree(worktree.id);

    expect(await vcs.readAt(version, "a.yaml")).toBe("2\n");
    expect(await plant.ran()).toBe(false);
  });
}

function worktreeGitFileCases(make: MakeVcs, test: HardenedTest): void {
  test("never trusts the .git file in a worktree's folder when committing a proposal", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const { vcs } = harness;
    const snapshot = await vcs.snapshot();
    const worktree = await vcs.addWorktree(snapshot);
    await harness.worktreeFiles(worktree).write("a.yaml", "2\n");
    // What ran in the worktree points its `.git` file at a planted repository (HAL-3188).
    await plantOf(harness).worktreeGitFile(worktree);

    const ref = "refs/halonic/proposals/run-1";
    const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: snapshot });
    // The proposal is in the workspace repository, with the worktree's files.
    expect(await vcs.readRef(ref)).toBe(proposal);
    expect(await vcs.readAt(proposal, "a.yaml")).toBe("2\n");
    expect(await plantOf(harness).ran()).toBe(false);
  });
}
