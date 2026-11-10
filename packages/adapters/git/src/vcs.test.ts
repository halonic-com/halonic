import { readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { plantedHooks } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  shellPath,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { gitVcsHarness, localSsh, remoteRunner } from "./harness.test-helper.ts";
import { GitVcs } from "./vcs.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

let sharedRemote: Promise<GitRunner> | undefined;
function withRemotes(): Promise<GitRunner> {
  sharedRemote ??= remoteRunner(scratch);
  return sharedRemote;
}

/** Plain git, reaching `ssh://` remotes through the local `ssh`; a failed call is fine, only what it ran counts. */
async function plainGitOverSsh(folder: string, args: readonly string[]): Promise<void> {
  const ssh = await localSsh(scratch);
  await plainGit(folder, ["-c", `core.sshCommand=${shellPath(ssh)}`, ...args]).catch(
    () => undefined,
  );
}

async function vcsAt(folder: string): Promise<GitVcs> {
  return new GitVcs(folder, { runner: await runner(), author: testAuthor });
}

verifies("git.vcs", () => {
  describe("paths through links", () => {
    it("refuses a path through a link to .git or out of the folder, and changes nothing", async () => {
      const outside = await scratch.folder();
      const folder = await repositoryWith(scratch);
      await symlink(join(folder, ".git"), join(folder, "link"));
      await symlink(outside, join(folder, "out"));
      const vcs = await vcsAt(folder);
      const before = await vcs.status();
      for (const path of ["link/config", "out/a.yaml", "link/hooks/pre-commit"]) {
        await expect(vcs.stage([path]), path).rejects.toThrow(RangeError);
        await expect(vcs.discard([path]), path).rejects.toThrow(RangeError);
        await expect(vcs.diff(path, false), path).rejects.toThrow(RangeError);
      }
      expect(await vcs.status()).toEqual(before);
    });
  });

  describe("folder paths", () => {
    /** A repository with a tracked `sub/a.yaml` changed, and an unignored private `sub/.env` beside it. */
    async function folderWithPrivateFile(): Promise<{ folder: string; vcs: GitVcs }> {
      const folder = await repositoryWith(scratch, { "sub/a.yaml": "1\n" });
      await writeFiles(folder, { "sub/a.yaml": "2\n", "sub/.env": "TOKEN=planted\n" });
      return { folder, vcs: await vcsAt(folder) };
    }

    it("refuses to stage a folder, which would stage the private file inside it", async () => {
      const { vcs } = await folderWithPrivateFile();
      const before = await vcs.status();
      await expect(vcs.stage(["sub"])).rejects.toThrow(RangeError);
      expect(await vcs.status()).toEqual(before);
    });

    it("refuses to unstage a folder", async () => {
      const { vcs } = await folderWithPrivateFile();
      await vcs.stage(["sub/a.yaml"]);
      const before = await vcs.status();
      await expect(vcs.unstage(["sub"])).rejects.toThrow(RangeError);
      expect(await vcs.status()).toEqual(before);
    });

    it("refuses to discard a folder, which would delete the private file inside it", async () => {
      const { folder, vcs } = await folderWithPrivateFile();
      await expect(vcs.discard(["sub"])).rejects.toThrow(RangeError);
      expect(await readFile(join(folder, "sub", ".env"), "utf8")).toBe("TOKEN=planted\n");
      expect(await readFile(join(folder, "sub", "a.yaml"), "utf8")).toBe("2\n");
    });
  });

  describe("init", () => {
    it("copies no template, starts on main and keeps .studio out", async () => {
      const folder = await scratch.folder();
      await writeFiles(folder, { "a.yaml": "1\n", ".studio/runs/run-1.jsonl": "{}\n" });
      const vcs = await vcsAt(folder);
      await vcs.init();

      expect(await readdir(join(folder, ".git"))).not.toContain("hooks");
      expect(await readFile(join(folder, ".git", "info", "exclude"), "utf8")).toBe("/.studio/\n");
      expect(await vcs.status()).toMatchObject({
        branch: "main",
        changes: [{ path: "a.yaml", status: "untracked", staged: false }],
      });
    });

    it("refuses a folder whose .git file points elsewhere, rather than init the repository there", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await scratch.folder();
      await writeFile(join(folder, ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);
      await expect((await vcsAt(folder)).init()).rejects.toThrow("outside the folder");
    });

    it("leaves .studio out of the status even when the exclude is gone", async () => {
      const folder = await repositoryWith(scratch);
      await rm(join(folder, ".git", "info"), { recursive: true, force: true });
      await writeFiles(folder, { ".studio/runs/run-1.jsonl": "{}\n" });
      expect((await (await vcsAt(folder)).status()).changes).toEqual([]);
    });

    it("unstages a new file before the first commit, which is untracked again", async () => {
      const folder = await scratch.folder();
      await writeFiles(folder, { "a.yaml": "1\n" });
      const vcs = await vcsAt(folder);
      await vcs.init();
      await vcs.stage(["a.yaml"]);
      await vcs.unstage(["a.yaml"]);
      expect((await vcs.status()).changes).toEqual([
        { path: "a.yaml", status: "untracked", staged: false },
      ]);
    });
  });

  describe("commits and pushes", () => {
    it("commits as the author the adapter was given, with a # line kept", async () => {
      const folder = await repositoryWith(scratch);
      const vcs = await vcsAt(folder);
      await writeFiles(folder, { "a.yaml": "2\n" });
      await vcs.stage(["a.yaml"]);
      await vcs.commit("# Not a comment");
      expect((await vcs.log(1))[0]).toMatchObject({
        author: testAuthor.name,
        message: "# Not a comment",
      });
    });

    it("refuses to push with no branch checked out", async () => {
      const folder = await repositoryWith(scratch);
      await plainGit(folder, ["checkout", "--quiet", "--detach"]);
      await expect((await vcsAt(folder)).push()).rejects.toThrow("no branch is checked out");
    });
  });

  // `vcs-remote.ts` pins both programs with `--upload-pack` and
  // `--receive-pack`, which beat the repository's config. The contract's
  // remote case plants both together; these show each on its own.
  describe("the remote's programs", () => {
    it("never runs a planted remote.origin.uploadpack when pulling, which plain git does", async () => {
      const [, theirs] = await gitVcsHarness(scratch, withRemotes, plantedHooks).clones({
        "a.yaml": "1\n",
      });
      await theirs.plant.config("remote.origin.uploadpack");
      await theirs.vcs.pull();
      expect(await theirs.plant.ran()).toBe(false);

      await plainGitOverSsh(theirs.files.location, ["pull", "--quiet", "--ff-only"]);
      expect(await theirs.plant.ran()).toBe(true);
    });

    it("never runs a planted remote.origin.receivepack when pushing, which plain git does", async () => {
      const [ours] = await gitVcsHarness(scratch, withRemotes, plantedHooks).clones({
        "a.yaml": "1\n",
      });
      await ours.plant.config("remote.origin.receivepack");
      await ours.files.write("a.yaml", "2\n");
      await ours.vcs.stage(["a.yaml"]);
      await ours.vcs.commit("Change a");
      await ours.vcs.push();
      expect(await ours.plant.ran()).toBe(false);

      await ours.files.write("a.yaml", "3\n");
      await plainGit(ours.files.location, ["commit", "--quiet", "--all", "--message=Plain"]);
      await plainGitOverSsh(ours.files.location, ["push", "--quiet", "origin", "main"]);
      expect(await ours.plant.ran()).toBe(true);
    });
  });

  describe("the hardened contract's plants", () => {
    it("run under plain git, so the contract's cases can fail", async () => {
      const harness = await gitVcsHarness(scratch, runner, plantedHooks).repo({ "a.yaml": "1\n" });
      await harness.plant.hook("pre-commit");
      await harness.files.write("a.yaml", "2\n");
      await harness.vcs.stage(["a.yaml"]);
      await harness.vcs.commit("Hardened");
      expect(await harness.plant.ran()).toBe(false);

      const folder = harness.files.location;
      await writeFile(join(folder, "a.yaml"), "3\n");
      await plainGit(folder, ["commit", "--quiet", "--all", "--message=Plain"]);
      expect(await harness.plant.ran()).toBe(true);
    });
  });
});

verifies("git.vcs-private-status", () => {
  describe("private files in the status", () => {
    it("leaves out an unignored .env, whatever its case, and lists the rest", async () => {
      const folder = await repositoryWith(scratch, { "sub/a.yaml": "1\n" });
      await writeFiles(folder, {
        "sub/a.yaml": "2\n",
        "sub/.env": "TOKEN=planted\n",
        ".ENV.local": "TOKEN=planted\n",
        ".envrc": "export TOKEN=planted\n",
      });
      expect((await (await vcsAt(folder)).status()).changes).toEqual([
        { path: "sub/a.yaml", status: "modified", staged: false },
      ]);
    });

    it("leaves out a rename from a private file", async () => {
      const folder = await repositoryWith(scratch, { ".env": "TOKEN=planted\n", "a.yaml": "1\n" });
      await plainGit(folder, ["mv", ".env", "b.yaml"]);
      expect((await (await vcsAt(folder)).status()).changes).toEqual([]);
    });
  });
});
