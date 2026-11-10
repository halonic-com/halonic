import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";

/** Where to look for git: the `PATH` and the platform it is read on. */
export interface FindGitOptions {
  /** The `PATH` (on Windows `Path` too); `process.env.PATH` by default. */
  path?: string;
  /** `process.platform` by default. */
  platform?: NodeJS.Platform;
}

/**
 * The absolute path of the `git` program, from the absolute folders of the
 * `PATH` in their order.
 *
 * A relative folder such as `.` or `bin` is skipped: it would be read
 * against whatever folder the process is in, which may be the workspace.
 * On Windows only `git.exe` counts, never `git.cmd` or `git.bat`, which
 * need a shell to run, and the current folder (which Windows would search
 * first for a bare `git`) is never searched.
 *
 * @throws Error when no folder of the `PATH` has git
 */
export async function findGit(options: FindGitOptions = {}): Promise<string> {
  const platform = options.platform ?? process.platform;
  const searchPath = options.path ?? process.env["PATH"] ?? process.env["Path"] ?? "";
  for (const candidate of gitCandidates(searchPath, platform)) {
    if (await isProgram(candidate, platform === "win32")) return candidate;
  }
  throw new Error(
    "git was not found in any absolute folder of the PATH. Install git and try again.",
  );
}

/** Where git may be, in order: `git` (`git.exe` on Windows) in each absolute folder of `searchPath`. */
export function gitCandidates(searchPath: string, platform: NodeJS.Platform): string[] {
  const windows = platform === "win32";
  const paths = windows ? win32 : posix;
  const programName = windows ? "git.exe" : "git";
  return searchPath
    .split(paths.delimiter)
    .filter((folder) => isAbsoluteFolder(folder, windows))
    .map((folder) => paths.join(folder, programName));
}

function isAbsoluteFolder(folder: string, windows: boolean): boolean {
  if (folder === "") return false;
  // A drive letter with a backslash and a `\\server\share` path are absolute;
  // `C:git`, with no backslash after the drive, and `\git` are not.
  if (windows) return /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/u.test(folder);
  return posix.isAbsolute(folder);
}

async function isProgram(candidate: string, windows: boolean): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) return false;
    // Windows has no execute bit: a file named `git.exe` is the program.
    if (!windows) await access(candidate, constants.X_OK);
    return true;
  } catch {
    // Missing or not executable here: try the next folder.
    return false;
  }
}
