import { plantedHooks } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { plainGit, Scratch } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { gitVcsHarness, remoteRunner } from "./harness.test-helper.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let sharedRemote: Promise<GitRunner> | undefined;
function withRemotes(): Promise<GitRunner> {
  sharedRemote ??= remoteRunner(scratch);
  return sharedRemote;
}

const make = () => gitVcsHarness(scratch, withRemotes, plantedHooks);

verifies("git.vcs-diverged", () => {
  describe("diverged", () => {
    it("never runs a planted remote.origin.uploadpack when it fetches", async () => {
      const [ours, theirs] = await make().clones({ "a.yaml": "1\n" });
      await theirs.plant.config("remote.origin.uploadpack");
      await ours.files.write("a.yaml", "2\n");
      await ours.vcs.stage(["a.yaml"]);
      await ours.vcs.commit("Change a");
      await ours.vcs.push();
      await theirs.files.write("b.yaml", "1\n");
      await theirs.vcs.stage(["b.yaml"]);
      await theirs.vcs.commit("Add b");

      expect((await theirs.vcs.diverged())?.items).toEqual([]);
      expect(await theirs.plant.ran()).toBe(false);
    });

    it("leaves a private entry both sides changed out of the items", async () => {
      const [ours, theirs] = await make().clones({ "a.yaml": "1\n" });
      await ours.commitPrivate(".env", "theirs\n");
      await ours.vcs.push();
      await theirs.commitPrivate(".env", "mine\n");
      await theirs.files.write("a.yaml", "2\n");
      await theirs.vcs.stage(["a.yaml"]);
      await theirs.vcs.commit("Change a");
      await ours.files.write("a.yaml", "3\n");
      await ours.vcs.stage(["a.yaml"]);
      await ours.vcs.commit("Change a elsewhere");
      await ours.vcs.push();

      expect((await theirs.vcs.diverged())?.items).toEqual(["a.yaml"]);
    });

    it("refuses when the branch and its upstream share no commit", async () => {
      const [ours, theirs] = await make().clones({ "a.yaml": "1\n" });
      await ours.files.write("a.yaml", "2\n");
      await ours.vcs.stage(["a.yaml"]);
      await ours.vcs.commit("Change a");
      await ours.vcs.push();
      const folder = theirs.files.location;
      // The empty tree, whose id git always knows.
      const empty = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
      const root = (await plainGit(folder, ["commit-tree", empty, "-m", "Unrelated"])).trim();
      await plainGit(folder, ["update-ref", "refs/heads/main", root]);

      await expect(theirs.vcs.diverged()).rejects.toThrow("share no version");
    });
  });
});
