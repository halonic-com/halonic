import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type DefinitionStore, isPrivateWorkspacePath, type VcsWorktree } from "@halonicjs/ports";
import {
  initRepository,
  plainGit,
  type Scratch,
  shellPath,
  testAuthor,
  testRunner,
  withFolderOnPath,
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
 * server's shell would run it. On Windows git asks for a remote at
 * `ssh://host/C:/a.git` as `'/C:/a.git'`, which the script turns back into
 * the drive path git needs.
 */
export async function localSsh(scratch: Scratch): Promise<string> {
  const ssh = join(await scratch.folder(), "ssh");
  const script = [
    "#!/bin/sh",
    "for last; do :; done",
    'case "$last" in',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, written literally
    '  git-*) run="git ${last#git-}" ;;',
    '  *) run="$last" ;;',
    "esac",
    `run=$(printf '%s' "$run" | sed "s|'/\\([A-Za-z]:/\\)|'\\1|")`,
    'exec sh -c "$run"',
  ];
  await writeFile(ssh, `${script.join("\n")}\n`);
  await chmod(ssh, 0o755);
  return ssh;
}

/** The adapter's runner for the tests, with the local `ssh` first on the `PATH`. */
export async function remoteRunner(scratch: Scratch): Promise<GitRunner> {
  const bin = dirname(await localSsh(scratch));
  return testRunner(scratch, withFolderOnPath(process.env, bin));
}

/**
 * The `ssh://` address of the repository at `path` on this computer, for
 * the local `ssh`. The host is never reached. On Windows the path's drive
 * follows the host's `/`: `ssh://acme.invalid/C:/a.git`.
 */
export function sshRemote(path: string): string {
  const slashed = shellPath(path);
  return `ssh://acme.invalid${slashed.startsWith("/") ? "" : "/"}${slashed}`;
}

/** One folder for the contract suite, shaped like its `VcsHarness`. */
export interface GitVcsFolder {
  vcs: GitVcs;
  files: FolderDefinitionStore;
  plant: Plant;
  worktreeFiles(worktree: VcsWorktree): DefinitionStore;
  writePrivate(worktree: VcsWorktree, path: string, content: string): Promise<void>;
  commitPrivate(path: string, content: string): Promise<void>;
  readPrivate(path: string): Promise<string | null>;
  nonCommitIds(commit: string): Promise<string[]>;
  parentsOf(commit: string): Promise<string[]>;
  privateAt(commit: string): Promise<string[]>;
}

type Files = Readonly<Record<string, string>>;

/** The contract suite's `MakeVcs`, on real git. */
export interface MakeGitVcs {
  drivesGit: true;
  platform: NodeJS.Platform;
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
    vcs: new GitVcs(folder, {
      runner: await runner(),
      author: testAuthor,
      // Outside the workspace, as the app's data folder is.
      worktrees: join(await scratch.folder(), "worktrees"),
    }),
    files: new FolderDefinitionStore(folder),
    plant: plantIn(folder, await scratch.folder(), plantedHooks),
    worktreeFiles: (worktree) => new FolderDefinitionStore(worktree.path),
    writePrivate: (worktree, path, content) => writeFiles(worktree.path, { [path]: content }),
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
    async parentsOf(commit) {
      // The commit's own id comes first, then its parents.
      const [, ...parents] = (await plainGit(folder, ["rev-list", "--parents", "-n", "1", commit]))
        .trim()
        .split(" ");
      return parents;
    },
    async privateAt(commit) {
      // `-z`, so git gives every path as it is, never quoted.
      const paths = await plainGit(folder, ["ls-tree", "-r", "-z", "--name-only", commit]);
      return paths.split("\0").filter(isPrivateWorkspacePath).sort();
    },
  });

  return {
    drivesGit: true,
    platform: process.platform,
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
        await plainGit(folder, ["remote", "set-url", "origin", sshRemote(remote)]);
        return harnessAt(folder);
      };
      return [await cloneOf(), await cloneOf()];
    },
  };
}
