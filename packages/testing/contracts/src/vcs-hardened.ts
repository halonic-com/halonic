import { expect, it } from "vitest";
import { type MakeVcs, type PlantGitCode, plantedHooks, type VcsHarness } from "./vcs-harness.ts";

/**
 * The hardened part of the {@link Vcs} contract (plan section 11): an adapter
 * that drives git runs it with `core.fsmonitor=false` and an empty hooks
 * path, trusted or not, so nothing planted in the repository ever runs.
 * An adapter that runs no git only checks it offers nothing to plant; see
 * `MakeVcs.drivesGit`.
 */
export function vcsHardenedCases(make: MakeVcs): void {
  if (!make.drivesGit) {
    it("runs no git, so it offers nothing to plant", async () => {
      expect((await make.repo({ "a.yaml": "1\n" })).plant).toBeUndefined();
    });
    return;
  }
  hookCases(make);
  fsmonitorCases(make);
}

function hookCases(make: MakeVcs): void {
  it("never runs a planted hook, in any local command", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    const plant = plantOf(harness);
    for (const hook of plantedHooks) await plant.hook(hook);
    const { vcs, files } = harness;

    await vcs.status();
    await files.write("a.yaml", "2\n");
    await files.write("b.yaml", "2\n");
    await vcs.diff("a.yaml", false);
    await vcs.stage(["a.yaml", "b.yaml"]);
    await vcs.diff("a.yaml", true);
    await vcs.unstage(["b.yaml"]);
    await vcs.discard(["b.yaml"]);
    await vcs.commit("Change a");
    await vcs.log(5);
    await vcs.createBranch("feature");
    await vcs.checkout("main");
    await vcs.branches();

    expect(await plant.ran()).toBe(false);
  });

  it("never runs a planted hook when pushing or pulling", async () => {
    const [ours, theirs] = await make.clones({ "a.yaml": "1\n" });
    for (const hook of plantedHooks) {
      await plantOf(ours).hook(hook);
      await plantOf(theirs).hook(hook);
    }

    await ours.files.write("a.yaml", "2\n");
    await ours.vcs.stage(["a.yaml"]);
    await ours.vcs.commit("Change a");
    await ours.vcs.push();
    await theirs.vcs.pull();

    expect(await theirs.files.read("a.yaml")).toBe("2\n");
    expect(await plantOf(ours).ran()).toBe(false);
    expect(await plantOf(theirs).ran()).toBe(false);
  });
}

function fsmonitorCases(make: MakeVcs): void {
  it("never runs a planted fsmonitor", async () => {
    const harness = await make.repo({ "a.yaml": "1\n" });
    const plant = plantOf(harness);
    await plant.fsmonitor();
    const { vcs, files } = harness;

    await files.write("a.yaml", "2\n");
    await vcs.status();
    await vcs.diff("a.yaml", false);
    await vcs.stage(["a.yaml"]);
    await vcs.commit("Change a");
    await vcs.status();

    expect(await plant.ran()).toBe(false);
  });
}

function plantOf(harness: VcsHarness): PlantGitCode {
  if (harness.plant === undefined) {
    throw new Error("An adapter that drives git must give `plant` for every repository and clone.");
  }
  return harness.plant;
}
