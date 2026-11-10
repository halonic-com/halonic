import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type DefinitionStore, isPrivateWorkspacePath } from "@halonicjs/ports";
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
 * Writes an `ssh` into a new folder and gives its path. It runs the
 * command a remote's server would run (its last argument) on this
 * computer, so a clone can use an `ssh://` remote, the only kind the
 * adapter allows besides `https`, with no server. A git command, such as
 * `git-upload-pack '/remote.git'`, runs as `git upload-pack`; any other,
 * such as a planted `remote.<name>.uploadpack`, runs as it is, the way the
 * server's shell would run it.
 */
export async function localSsh(scratch: Scratch): Promise<string> {
  const ssh = join(await scratch.folder(), "ssh");
  const script = [
    "#!/bin/sh",
    "for last; do :; done",
    'case "$last" in',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, written literally
    '  git-*) exec sh -c "git ${last#git-}" ;;',
    '  *) exec sh -c "$last" ;;',
    "esac",
  ];
  await writeFile(ssh, `${script.join("\n")}\n`);
  await chmod(ssh, 0o755);
  return ssh;
}

/** The adapter's runner for the tests, with the local `ssh` first on the `PATH`. */
export async function remoteRunner(scratch: Scratch): Promise<GitRunner> {
  const bin = dirname(await localSsh(scratch));
  return testRunner(scratch, { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` });
}

/** One folder for the contract suite, shaped like its `VcsHarness`. */
export interface GitVcsFolder {
  vcs: GitVcs;
  files: FolderDefinitionStore;
  plant: Plant;
  worktreeFiles(): DefinitionStore;
  writePrivate(): Promise<void>;
  commitPrivate(path: string, content: string): Promise<void>;
  readPrivate(path: string): Promise<string | null>;
  nonCommitIds(commit: string): Promise<string[]>;
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

/** `GitVcs` has no worktrees yet (HAL-3245, git PR 4); no contract case asks for one before it does. */
function noWorktreesYet(): never {
  throw new Error("The git Vcs has no worktrees yet.");
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
    worktreeFiles: noWorktreesYet,
    writePrivate: async () => noWorktreesYet(),
    async commitPrivate(path, content) {
      await writeFiles(folder, { [path]: content });
      // `--force`, since a repository may ignore it; plain git, since the port refuses to stage it.
      await plainGit(folder, ["add", "--force", "--", path]);
      await plainGit(folder, ["commit", "--quiet", `--message=Commit ${path}`]);
    },
    readPrivate: (path) => readFile(join(folder, path), "utf8").catch(() => null),
    async nonCommitIds(commit) {
      const tree = await plainGit(folder, ["rev-parse", `${commit}^{tree}`]);
      const blobs = await plainGit(folder, ["ls-tree", "-r", "--object-only", commit]);
      const [blob] = blobs.split("\n");
      return blob ? [tree.trim(), blob] : [tree.trim()];
    },
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
      // A private entry is in the folder but not in the commit, as the harness says.
      const isPrivate = ([path]: [string, string]) => isPrivateWorkspacePath(path);
      const entries = Object.entries(files);
      await initRepository(folder, Object.fromEntries(entries.filter((e) => !isPrivate(e))));
      await writeFiles(folder, Object.fromEntries(entries.filter(isPrivate)));
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
