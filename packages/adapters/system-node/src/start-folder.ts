import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";

/** The parts of a profile that decide where a program may start. */
export type StartFolderProfile = Pick<
  SandboxProfile,
  "workingFolder" | "readOnlyPaths" | "deniedPaths" | "reopenedPaths"
>;

/**
 * Where a sandbox session's program starts, as `SandboxCommand.cwd` allows
 * it (HAL-6884): inside the working folder, or inside a path of the
 * profile's `readOnlyPaths`, such as the workspace a connector's script is
 * in. A path of `deniedPaths` wins over both, unless it is reopened, and so
 * does each of `hiddenFolders`, the session's own private folders.
 *
 * Every path is compared where it really is, through symbolic links, because
 * a folder in the workspace can be a link to anywhere. The program starts in
 * that real folder, so a link changed after the check can't move it. A start
 * folder that doesn't exist yet is read through the links above it; the
 * program then can't start, and ends with a non-zero code.
 *
 * @param requested - `SandboxCommand.cwd`, read against the working folder; absent means the working folder
 * @param hiddenFolders - folders of the session the program may never start in
 * @returns the real absolute folder to start in
 * @throws when the folder lies outside those rules, naming it
 */
export async function startFolder(
  profile: StartFolderProfile,
  requested: string | undefined,
  hiddenFolders: readonly string[] = [],
): Promise<string> {
  const asked = resolve(profile.workingFolder, requested ?? ".");
  const folder = await realPath(asked);
  const isIn = async (paths: readonly string[]) => {
    for (const path of paths) {
      if (isInside(await realPath(path), folder)) return true;
    }
    return false;
  };
  if (!(await isIn([profile.workingFolder, ...profile.readOnlyPaths]))) {
    throw new Error(
      `the program must start inside the working folder or a read-only path, not in ${asked}`,
    );
  }
  const denied = (await isIn(profile.deniedPaths)) && !(await isIn(profile.reopenedPaths ?? []));
  if (denied || (await isIn(hiddenFolders))) {
    throw new Error(`the program can't start in ${asked}: the folder is denied to it`);
  }
  return folder;
}

/**
 * Where `path` really is: through every symbolic link of its deepest part
 * that exists, with the parts that don't exist yet added back as written.
 */
async function realPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    const parent = dirname(absolute);
    // The root always exists, so this ends; a root that can't be read stays as it is.
    if (parent === absolute) return absolute;
    return join(await realPath(parent), basename(absolute));
  }
}

/** Whether `child` is `parent` or lies inside it, in this system's path rules (case-blind on Windows). */
function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
