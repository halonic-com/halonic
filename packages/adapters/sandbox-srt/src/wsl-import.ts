import { posix } from "node:path";
import { type WslRoot, withImportMount } from "./wsl-mounts.ts";
import { wslProjectFolder } from "./wsl-projects.ts";

/** The user the imported project belongs to in the distro. */
const PROJECT_OWNER = "halonic:halonic";

// A remote's name and address, so neither can be read as an option by `git remote add`.
const remoteName = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

async function mustRun(root: WslRoot, argv: readonly string[]): Promise<string> {
  const { code, stdout } = await root.run(argv);
  if (code !== 0)
    throw new Error(
      `${argv[0]} ${argv[1] ?? ""} failed in the distro (exit ${code})`.replace("  ", " "),
    );
  return stdout;
}

/** Git as root on the read-only source: its folder is owned by Windows, so git must be told to trust it. */
function sourceGit(source: string, args: readonly string[]): string[] {
  return ["git", "-c", `safe.directory=${source}`, "-C", source, ...args];
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
async function sourceRemotes(root: WslRoot, source: string): Promise<Array<[string, string]>> {
  const { code, stdout } = await root.run(
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
 * The project is made at the distro's project folder for `name` and owned by
 * the `halonic` user. A failed import removes what it made.
 *
 * @throws when the name or the folder isn't valid, the project already exists, or the folder isn't a git repository
 */
export async function importWindowsProject(
  root: WslRoot,
  windowsFolder: string,
  name: string,
): Promise<string> {
  const destination = wslProjectFolder("distro", name);
  if ((await root.run(["test", "-e", destination])).code === 0)
    throw new Error(`the project ${JSON.stringify(name)} already exists`);
  await mustRun(root, ["mkdir", "-p", "--", posix.dirname(destination)]);
  try {
    await withImportMount(root, windowsFolder, async (source) => {
      const inside = await root.run(sourceGit(source, ["rev-parse", "--is-inside-work-tree"]));
      if (inside.code !== 0) throw new Error("the folder isn't a git repository");
      const remotes = await sourceRemotes(root, source);
      await mustRun(root, ["git", "clone", "--no-hardlinks", "--", source, destination]);
      await mustRun(root, ["git", "-C", destination, "remote", "remove", "origin"]);
      for (const [remote, url] of remotes) {
        if (!remoteName.test(remote) || url.startsWith("-")) continue;
        await mustRun(root, ["git", "-C", destination, "remote", "add", remote, "--", url]);
      }
      await copyUncommitted(root, source, destination);
    });
    await mustRun(root, ["chown", "-R", PROJECT_OWNER, "--", destination]);
  } catch (error) {
    await root.run(["rm", "-rf", "--", destination]); // the folder this import made, checked above not to exist
    throw error;
  }
  return destination;
}

async function copyUncommitted(root: WslRoot, source: string, destination: string): Promise<void> {
  const list = async (flag: string[]) =>
    nulList(await mustRun(root, sourceGit(source, ["ls-files", "-z", ...flag])));
  const deleted = new Set(await list(["--deleted"]));
  const changed = [
    ...(await list(["--modified"])),
    ...(await list(["--others", "--exclude-standard"])),
  ];
  for (const file of deleted) {
    assertRelative(file);
    await mustRun(root, ["rm", "-f", "--", posix.join(destination, file)]);
  }
  for (const file of new Set(changed)) {
    if (deleted.has(file)) continue;
    assertRelative(file);
    const target = posix.join(destination, file);
    await mustRun(root, ["mkdir", "-p", "--", posix.dirname(target)]);
    // -P copies a link as a link, so a link in the source is never followed
    await mustRun(root, ["cp", "-P", "--no-preserve=all", "--", posix.join(source, file), target]);
  }
}
