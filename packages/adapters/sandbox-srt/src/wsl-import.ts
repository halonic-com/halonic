import { posix } from "node:path";
import { type WslDistro, withImportMount } from "./wsl-mounts.ts";
import { wslProjectFolder } from "./wsl-projects.ts";

// A remote's name and address, so neither can be read as an option by `git remote add`.
const remoteName = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

async function mustRun(distro: WslDistro, argv: readonly string[]): Promise<string> {
  const { code, stdout } = await distro.run(argv);
  if (code !== 0)
    throw new Error(
      `${argv[0]} ${argv[1] ?? ""} failed in the distro (exit ${code})`.replace("  ", " "),
    );
  return stdout;
}

/**
 * Git on the read-only source, for questions that never run anything from the
 * source's own config. The import mount's files belong to the `halonic` user,
 * who runs git, so git needs no `safe.directory`.
 */
function sourceGit(source: string, args: readonly string[]): string[] {
  return ["git", "-C", source, ...args];
}

/**
 * Git with the clone's own git folder (and so its config, which this import
 * made) against the source's files. The source's config is never read, so a
 * command set there (`core.fsmonitor`, a clean filter) can't run.
 */
function cloneGitOnSource(source: string, destination: string, args: readonly string[]): string[] {
  return ["git", `--git-dir=${posix.join(destination, ".git")}`, `--work-tree=${source}`, ...args];
}

/** A path inside the project: it resolves (links followed) to the project folder or below it. */
async function assertInside(distro: WslDistro, project: string, path: string): Promise<void> {
  const resolved = (await mustRun(distro, ["realpath", "-m", "--", path])).trim();
  if (resolved !== project && !resolved.startsWith(`${project}/`))
    throw new Error(`the file ${JSON.stringify(path)} would be written outside the project`);
}

/** A path from the source's file list: relative, with no `..`, so it can't reach out of the project. */
function assertRelative(path: string): void {
  if (path.startsWith("/") || path.split("/").some((part) => part === ".." || part === ""))
    throw new Error(`the file ${JSON.stringify(path)} isn't a path inside the project`);
}

function nulList(stdout: string): string[] {
  return stdout.split("\0").filter((entry) => entry !== "");
}

/** The remotes of the source repository, as `[name, url]`. */
async function sourceRemotes(distro: WslDistro, source: string): Promise<Array<[string, string]>> {
  const { code, stdout } = await distro.run(
    sourceGit(source, ["config", "-z", "--get-regexp", "^remote\\..*\\.url$"]),
  );
  if (code !== 0) return []; // exit 1: no remote
  return nulList(stdout).flatMap((entry) => {
    const [key = "", url = ""] = entry.split("\n");
    const name = key.slice("remote.".length, -".url".length);
    return [[name, url] as [string, string]];
  });
}

/**
 * Imports a Windows folder that is a git repository as a project in the
 * distro: the source is mounted read-only only for the import (W5), cloned
 * there, and the clone gets the source's remotes back and its uncommitted
 * changes (modified, deleted and untracked files that aren't ignored).
 *
 * Everything but the mount and the unmount runs as the `halonic` user, who
 * owns the project folder and, through the mount's `uid=`, the source's files:
 * root never writes or deletes by path in a folder `halonic` can change, so a
 * link put there can't turn root's writes elsewhere (W2b). The project is made
 * at the distro's project folder for `name`. A failed import removes what it made.
 *
 * Every local branch of the source is kept. A remote whose name or address
 * git could read as an option is not copied; `onSkippedRemote` is told its name.
 * An untracked nested repository is copied as it is; a modified submodule's
 * folder isn't (the clone leaves submodules empty).
 *
 * @throws when the name or the folder isn't valid, the project already exists, or the folder isn't a git repository
 */
export async function importWindowsProject(
  distro: WslDistro,
  windowsFolder: string,
  name: string,
  onSkippedRemote: (remote: string) => void = () => {},
): Promise<string> {
  const destination = wslProjectFolder("distro", name);
  if ((await distro.run(["test", "-e", destination])).code === 0)
    throw new Error(`the project ${JSON.stringify(name)} already exists`);
  await mustRun(distro, ["mkdir", "-p", "--", posix.dirname(destination)]);
  try {
    await withImportMount(distro, windowsFolder, async (source) => {
      const inside = await distro.run(sourceGit(source, ["rev-parse", "--is-inside-work-tree"]));
      if (inside.code !== 0) throw new Error("the folder isn't a git repository");
      const remotes = await sourceRemotes(distro, source);
      await mustRun(distro, ["git", "clone", "--no-hardlinks", "--", source, destination]);
      // the clone has only the current branch; the others are remote branches until `origin` goes
      await mustRun(distro, [
        "git",
        "-C",
        destination,
        "fetch",
        "--update-head-ok",
        "--no-tags",
        "--",
        source,
        "+refs/heads/*:refs/heads/*",
      ]);
      await mustRun(distro, ["git", "-C", destination, "remote", "remove", "origin"]);
      for (const [remote, url] of remotes) {
        if (!remoteName.test(remote) || url.startsWith("-")) {
          onSkippedRemote(remote);
          continue;
        }
        await mustRun(distro, ["git", "-C", destination, "remote", "add", remote, "--", url]);
      }
      await copyUncommitted(distro, source, destination);
    });
  } catch (error) {
    await distro.run(["rm", "-rf", "--", destination]); // the folder this import made, checked above not to exist
    throw error;
  }
  return destination;
}

async function copyUncommitted(
  distro: WslDistro,
  source: string,
  destination: string,
): Promise<void> {
  const project = (await mustRun(distro, ["realpath", "-m", "--", destination])).trim();
  // the clone's index is the source's last commit, so staged changes count as changes too
  const list = async (flag: string[]) =>
    nulList(
      await mustRun(distro, cloneGitOnSource(source, destination, ["ls-files", "-z", ...flag])),
    );
  const deleted = new Set(await list(["--deleted"]));
  const changed = [
    ...(await list(["--modified"])),
    ...(await list(["--others", "--exclude-standard"])),
  ];
  for (const file of deleted) {
    assertRelative(file);
    const target = posix.join(destination, file);
    await assertInside(distro, project, posix.dirname(target));
    await mustRun(distro, ["rm", "-f", "--", target]);
  }
  for (const entry of new Set(changed)) {
    if (deleted.has(entry)) continue;
    const nested = entry.endsWith("/"); // an untracked nested repository
    const file = nested ? entry.slice(0, -1) : entry;
    assertRelative(file);
    const from = posix.join(source, file);
    // a modified submodule shows as its folder; the clone has the submodule empty
    if (
      !nested &&
      (await distro.run(["test", "-d", from])).code === 0 &&
      (await distro.run(["test", "-L", from])).code !== 0
    )
      continue;
    const target = posix.join(destination, file);
    await assertInside(distro, project, posix.dirname(target)); // before anything is made there
    await mustRun(distro, ["mkdir", "-p", "--", posix.dirname(target)]);
    await mustRun(distro, ["rm", "-rf", "--", target]); // a link at the target is replaced, not written through
    // -P copies a link as a link, so a link in the source is never followed
    await mustRun(distro, ["cp", "-rP", "--no-preserve=all", "--", from, target]);
  }
}
