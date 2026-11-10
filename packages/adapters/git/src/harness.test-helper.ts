import { chmod, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import {
  initRepository,
  plainGit,
  type Scratch,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { type Plant, plantIn } from "./plant.test-helper.ts";
import { GitVcs } from "./vcs.ts";

/**
 * An `ssh` that runs the command a remote's server would run (its last
 * argument) on this computer, so a clone can use an `ssh://` remote, the
 * only kind the adapter allows besides `https`, with no server.
 */
async function localSsh(folder: string): Promise<void> {
  const ssh = join(folder, "ssh");
  // The command, such as `git-upload-pack '/remote.git'`, is the last argument.
  await writeFile(ssh, `#!/bin/sh\nfor last; do :; done\nexec sh -c "git \${last#git-}"\n`);
  await chmod(ssh, 0o755);
}

/** The adapter's runner for the tests, with the local `ssh` first on the `PATH`. */
export async function remoteRunner(scratch: Scratch): Promise<GitRunner> {
  const bin = await scratch.folder();
  await localSsh(bin);
  return testRunner(scratch, { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` });
}

/** One folder for the contract suite, shaped like its `VcsHarness`. */
export interface GitVcsFolder {
  vcs: GitVcs;
  files: FolderDefinitionStore;
  plant: Plant;
}

type Files = Readonly<Record<string, string>>;

/** The contract suite's `MakeVcs`, on real git. */
export interface MakeGitVcs {
  drivesGit: true;
  folder(files: Files): Promise<GitVcsFolder>;
  nested(files: Files): Promise<GitVcsFolder>;
  repo(files: Files): Promise<GitVcsFolder>;
  clones(files: Files): Promise<[GitVcsFolder, GitVcsFolder]>;
}

/** The contract's folders, on real git, each in a new scratch folder. */
export function gitVcsHarness(
  scratch: Scratch,
  runner: () => Promise<GitRunner>,
  plantedHooks: readonly string[],
): MakeGitVcs {
  const harnessAt = async (folder: string): Promise<GitVcsFolder> => ({
    vcs: new GitVcs(folder, { runner: await runner(), author: testAuthor }),
    files: new FolderDefinitionStore(folder),
    plant: plantIn(folder, await scratch.folder(), plantedHooks),
  });

  return {
    drivesGit: true,
    async folder(files) {
      const folder = await scratch.folder();
      await writeFiles(folder, { ...files, ".studio/runs/run-1.jsonl": "{}\n" });
      return harnessAt(folder);
    },
    async nested(files) {
      const parent = await scratch.folder();
      await initRepository(
        parent,
        Object.fromEntries(Object.entries(files).map(([p, c]) => [`acme/${p}`, c])),
      );
      return harnessAt(join(parent, "acme"));
    },
    async repo(files) {
      const folder = await scratch.folder();
      await initRepository(folder, files);
      return harnessAt(folder);
    },
    async clones(files) {
      const seed = await scratch.folder();
      await initRepository(seed, files);
      const remote = join(await scratch.folder(), "acme.git");
      await plainGit(seed, ["clone", "--quiet", "--bare", "--template=", seed, remote]);
      const cloneOf = async (): Promise<GitVcsFolder> => {
        const folder = join(await scratch.folder(), "clone");
        await plainGit(dirname(folder), ["clone", "--quiet", "--template=", remote, folder]);
        await plainGit(folder, ["remote", "set-url", "origin", `ssh://acme.invalid${remote}`]);
        return harnessAt(folder);
      };
      return [await cloneOf(), await cloneOf()];
    },
  };
}
