// The read grants a harness needs in a Windows sandbox (HAL-5129). There, the
// agent host's `--sandbox-setup` doesn't give sandboxed programs srt's read
// grant for the user profile, so a program reads in the profile only what
// its session profile names. A harness installed under the profile, such as
// Claude Code in `%USERPROFILE%\.local\bin` or Codex in `%APPDATA%\npm`
// running on an nvm or fnm Node, must be named or it can't start.
//
// Only what the start needs is named, at its real place: the folder of the
// program the sandbox starts, and for a harness that runs on Node, the
// harness's own package folder. Never the user profile itself, and never
// Halonic's data folder or anything in it. A path outside the profile adds
// nothing, because the sandbox reads it already.

import { realpath } from "node:fs/promises";
import { win32 } from "node:path";

/** How a harness starts on this computer, as the launcher found it. Every path is absolute. */
export interface HarnessInstall {
  /**
   * The program the sandbox starts: the harness's own program (`claude.exe`),
   * or the Node program (`node.exe`) that runs a harness installed with npm.
   */
  readonly program: string;
  /**
   * For a harness that runs on Node, its package folder, such as
   * `%APPDATA%\npm\node_modules\@openai\codex`; `null` for a harness that is
   * its own program.
   */
  readonly packageFolder: string | null;
}

/** The folders of this computer the read grants are checked against. Every path is absolute. */
export interface WindowsUserFolders {
  /** `%USERPROFILE%`: only paths inside it are named. */
  readonly userProfile: string;
  /** Halonic's data folder (`%LOCALAPPDATA%\halonic`), which the profile denies, and so never names. */
  readonly halonicData: string;
}

/** Resolves a path to its real place; throws when it can't, such as a missing path. */
export type RealPath = (path: string) => Promise<string>;

/** Resolves on this computer's disk. */
export const realPathOnDisk: RealPath = (path) => realpath(path);

/**
 * The paths a Windows sandbox profile names read-only so that the harness
 * can start: the real folder of {@link HarnessInstall.program} and the real
 * {@link HarnessInstall.packageFolder}, each only when it is inside the user
 * profile. The user folders are resolved too, so a profile reached through a
 * junction compares as it is on disk, also while Halonic's data folder
 * doesn't exist yet. The answer has no duplicates, and is
 * empty for a harness installed outside the profile, such as in
 * `%ProgramFiles%`.
 *
 * @example
 * const install = { program: nodeOnPath, packageFolder: codexPackageFolder };
 * const folders = { userProfile: env.USERPROFILE, halonicData: profileFolder(environment) };
 * profile.readOnlyPaths.push(...(await windowsInstallReadPaths(install, folders)));
 *
 * @throws when a path of the install can't be resolved, such as a missing program
 * @throws when a folder to name is the user profile itself, or is, holds or is inside Halonic's data folder
 */
export async function windowsInstallReadPaths(
  install: HarnessInstall,
  folders: WindowsUserFolders,
  realPath: RealPath = realPathOnDisk,
): Promise<string[]> {
  const userProfile = await realThroughNearest(folders.userProfile, realPath);
  const halonicData = await realThroughNearest(folders.halonicData, realPath);
  const wanted: Array<{ name: string; folder: string }> = [
    {
      name: "program's folder",
      folder: win32.dirname(await needed("program", install.program, realPath)),
    },
  ];
  if (install.packageFolder !== null) {
    const folder = await needed("package folder", install.packageFolder, realPath);
    wanted.push({ name: "package folder", folder });
  }

  const named: string[] = [];
  for (const { name, folder } of wanted) {
    if (isSamePath(folder, userProfile)) {
      throw new Error(
        `the harness's ${name} is the user profile ${folder}, which a sandbox never reads as a whole`,
      );
    }
    if (!isInsideOrSame(folder, userProfile)) continue;
    if (isInsideOrSame(folder, halonicData) || isInsideOrSame(halonicData, folder)) {
      throw new Error(
        `the harness's ${name} ${folder} overlaps Halonic's data folder ${halonicData}`,
      );
    }
    if (!named.some((path) => isSamePath(path, folder))) named.push(folder);
  }
  return named;
}

/** The real place of a path the harness needs. */
async function needed(name: string, path: string, realPath: RealPath): Promise<string> {
  try {
    return await realPath(path);
  } catch (error) {
    throw new Error(`can't find the harness's ${name} ${path}`, { cause: error });
  }
}

/**
 * The real place of a folder to compare against, also when it doesn't exist
 * yet: the real place of the nearest folder on its way that exists, with the
 * rest of its names added. A data folder not made yet, in a profile reached
 * through a junction, then still compares where it will be.
 */
async function realThroughNearest(folder: string, realPath: RealPath): Promise<string> {
  const missingNames: string[] = [];
  let nearest = folder;
  for (;;) {
    try {
      return win32.join(await realPath(nearest), ...missingNames.reverse());
    } catch {
      const parent = win32.dirname(nearest);
      if (parent === nearest) return folder;
      missingNames.push(win32.basename(nearest));
      nearest = parent;
    }
  }
}

/** Whether two Windows paths name the same place, in any letter case. */
function isSamePath(a: string, b: string): boolean {
  return win32.relative(a, b) === "";
}

/** Whether Windows `path` is `folder` or inside it, in any letter case. Both are absolute. */
function isInsideOrSame(path: string, folder: string): boolean {
  const way = win32.relative(folder, path);
  return (
    way === "" || (!win32.isAbsolute(way) && way !== ".." && !way.startsWith(`..${win32.sep}`))
  );
}
