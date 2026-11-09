import { expect, it } from "vitest";
import { type MakeVcs, type PlantGitCode, plantedHooks, type VcsHarness } from "./vcs-harness.ts";

/** How the hardened cases declare a test: `it`, or `it.fails` for a self-test. */
export type HardenedTest = (name: string, body: () => Promise<void>) => void;

/**
 * The hardened part of the {@link Vcs} contract (plan section 11): an adapter
 * that drives git never runs a hook, an fsmonitor command or any other
 * program planted in the repository's own config or attributes, trusted or
 * not. An adapter that runs no git only checks it offers nothing to plant;
 * see `MakeVcs.drivesGit`.
 *
 * `test` is `it`; a self-test passes `it.fails` with a plant that reports
 * it ran, to show every case would catch it.
 */
export function vcsHardenedCases(make: MakeVcs, test: HardenedTest = it): void {
  if (!make.drivesGit) {
    test("runs no git, so it offers nothing to plant", async () => {
      expect((await make.repo({ "a.yaml": "1\n" })).plant).toBeUndefined();
    });
    return;
  }
  hookCases(make, test);
  configCases(make, test);
  remoteCases(make, test);
  localRemoteCases(make, test);
}

function hookCases(make: MakeVcs, test: HardenedTest): void {
  test("never runs a planted hook, in any local command", async () => {
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

  test("never runs a planted hook when pushing or pulling", async () => {
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

/** Keys whose program a local command could start, with the attributes that switch them on. */
async function plantLocalConfig(plant: PlantGitCode): Promise<void> {
  await plant.config("core.fsmonitor");
  for (const key of ["clean", "smudge", "process"]) await plant.config(`filter.planted.${key}`);
  await plant.attributes("* filter=planted");
  await plant.config("diff.external");
  await plant.config("diff.planted.command");
  await plant.config("diff.planted.textconv");
  await plant.attributes("* diff=planted");
  await plant.config("gpg.program");
  await plant.config("commit.gpgSign", "true");
  await plant.config("log.showSignature", "true");
}

function configCases(make: MakeVcs, test: HardenedTest): void {
  test("never runs a program planted in the config, in any local command", async () => {
    const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n" });
    const plant = plantOf(harness);
    await plantLocalConfig(plant);
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

    expect(await files.read("b.yaml")).toBe("1\n");
    expect(await plant.ran()).toBe(false);
  });
}

function remoteCases(make: MakeVcs, test: HardenedTest): void {
  test("never runs a program planted in the config when pushing or pulling", async () => {
    const [ours, theirs] = await make.clones({ "a.yaml": "1\n" });
    for (const harness of [ours, theirs]) {
      const plant = plantOf(harness);
      await plantLocalConfig(plant);
      await plant.config("remote.origin.uploadpack");
      await plant.config("remote.origin.receivepack");
      await plant.config("credential.helper");
      await plant.config("core.askPass");
      await plant.config("push.gpgSign", "true");
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

  test("never runs an ext:: URL or an ssh command planted in the config", async () => {
    const [ours, theirs] = await make.clones({ "a.yaml": "1\n" });
    await plantOf(ours).config("protocol.ext.allow", "always");
    await plantOf(ours).config("remote.origin.url");
    await plantOf(theirs).config("remote.origin.url", "ssh://planted.invalid/repo.git");
    await plantOf(theirs).config("core.sshCommand");

    // Neither remote can be reached; all that matters is that nothing planted ran.
    await ours.vcs.pull().catch(() => undefined);
    await ours.vcs.push().catch(() => undefined);
    await theirs.vcs.pull().catch(() => undefined);
    await theirs.vcs.push().catch(() => undefined);

    expect(await plantOf(ours).ran()).toBe(false);
    expect(await plantOf(theirs).ran()).toBe(false);
  });
}

function localRemoteCases(make: MakeVcs, test: HardenedTest): void {
  test("never runs a hook planted in a local remote", async () => {
    const [ours] = await make.clones({ "a.yaml": "1\n" });
    await plantOf(ours).localRemote();
    await ours.files.write("a.yaml", "2\n");
    await ours.vcs.stage(["a.yaml"]);
    await ours.vcs.commit("Change a");

    // The port refuses a local remote; all that matters is that nothing planted ran.
    await ours.vcs.push().catch(() => undefined);
    await ours.vcs.pull().catch(() => undefined);

    expect(await plantOf(ours).ran()).toBe(false);
  });
}

function plantOf(harness: VcsHarness): PlantGitCode {
  if (harness.plant === undefined) {
    throw new Error("An adapter that drives git must give `plant` for every repository and clone.");
  }
  return harness.plant;
}
