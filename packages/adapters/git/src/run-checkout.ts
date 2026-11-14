import { lstat, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAbsolutePath } from "@halonicjs/adapter-system-node";
import { checkGitAddress, fullCommitId, isPlainRef, mustSucceed } from "./git-export.ts";
import type { GitRunner } from "./git-runner.ts";
import { isInside } from "./repository-location.ts";

// A git checkout of its own for one agent run, inside the run's working
// folder. The sandbox may write only there, and a worktree of the shared
// repository keeps its index and refs in the shared `.git`, outside it.

/** What {@link makeRunCheckout} needs. */
export interface RunCheckoutOptions {
  /** The shared repository, as the folder of a clone or of one of its worktrees. Its objects are borrowed, never written. */
  shared: string;
  /** The run's working folder: absolute, new or empty, and not inside the shared repository. */
  folder: string;
  /** The task's branch, a plain name such as `priya/HAL-42-fix`; made at `start`. */
  branch: string;
  /** The full id of the commit the branch starts at; the shared repository must have it. */
  start: string;
  /** The remote the run fetches from and pushes to, an `https://` or `ssh://` address. */
  remote: string;
}

/**
 * Makes a checkout of `options.start` on `options.branch` in `options.folder`.
 * It is what `git clone --reference <shared>` leaves, without the clone: the
 * folder's `objects/info/alternates` names the shared repository's objects,
 * so they are read from there and nothing is copied, and `origin` is the
 * real remote. A clone from the shared folder itself would be a local
 * transport, which the runner never allows, and would run that repository's
 * own upload-pack settings.
 *
 * The folder's `.git/hooks` is empty (no templates) and `.git/config` holds
 * only the remote and the branch, so there is nothing for the sandbox's
 * read-only rule on them to hide. The shared repository is only read.
 * Nothing is fetched, so no network is needed. Because its objects live
 * outside the folder, the adapter's own `Repository` won't open the
 * checkout; the run's git does.
 *
 * @throws Error when an option is refused, the shared repository lacks the commit, or git fails; a folder this call made is removed first
 */
export async function makeRunCheckout(
  runner: GitRunner,
  options: RunCheckoutOptions,
): Promise<void> {
  const { shared, folder, branch, start, remote } = options;
  checkOptions(options);
  const objects = await sharedObjects(runner, shared);
  if ((await readdir(folder).catch(() => [])).length > 0) {
    throw new Error(`The run folder ${folder} isn't empty.`);
  }
  const existed = await lstat(folder).then(
    () => true,
    () => false,
  );
  await mkdir(folder, { recursive: true });
  const git = async (step: string, args: readonly string[]): Promise<void> => {
    await mustSucceed(await runner.run({ cwd: folder, args }), step);
  };
  try {
    await checkFolder(shared, folder);
    await git("set up the checkout", [
      "init",
      "--quiet",
      "--template=",
      `--initial-branch=${branch}`,
    ]);
    // `--template=` leaves no `hooks`; an empty one is there for the sandbox's rule on it.
    await mkdir(join(folder, ".git", "hooks"));
    await writeFile(join(folder, ".git", "objects", "info", "alternates"), `${objects}\n`);
    await git("name the remote", ["remote", "add", "origin", "--", remote]);
    await git("find the commit in the shared repository", ["cat-file", "-e", `${start}^{commit}`]);
    await git("check the branch out", ["checkout", "--quiet", "-B", branch, start]);
  } catch (error) {
    if (existed) await emptyFolder(folder);
    else await rm(folder, { recursive: true, force: true });
    throw error;
  }
}

/** Deletes a run's folder, whatever is in it. Nothing is left of the run but its pushed branch. */
export async function removeRunCheckout(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}

function checkOptions({ shared, folder, branch, start, remote }: RunCheckoutOptions): void {
  for (const path of [shared, folder]) {
    if (!isAbsolutePath(path))
      throw new Error(`A run checkout needs absolute folders, not ${path}.`);
  }
  if (!isPlainRef(branch)) throw new Error(`Can't use "${branch}" as a branch name.`);
  if (!fullCommitId.test(start))
    throw new Error("The start of a run checkout is a full commit id.");
  checkGitAddress(remote);
}

/** The real path of the shared repository's objects folder, which holds every worktree's objects too. */
async function sharedObjects(runner: GitRunner, shared: string): Promise<string> {
  const found = await runner.run({
    cwd: shared,
    args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
  });
  await mustSucceed(found, "find the shared repository");
  return realpath(join(found.stdout.toString("utf8").trim(), "objects"));
}

/** The folder is not inside the shared repository; an empty one can't hold it. */
async function checkFolder(shared: string, folder: string): Promise<void> {
  const [realShared, realFolder] = await Promise.all([realpath(shared), realpath(folder)]);
  if (isInside(realShared, realFolder)) {
    throw new Error(`The run folder ${folder} can't be inside the shared repository.`);
  }
}

async function emptyFolder(folder: string): Promise<void> {
  for (const entry of await readdir(folder)) {
    await rm(join(folder, entry), { recursive: true, force: true });
  }
}
