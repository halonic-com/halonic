import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import { isAbsolutePath } from "./absolute-path.ts";

/** Where to look for a program: the `PATH` and the platform it is read on. */
export interface FindProgramOptions {
  /** The `PATH` (on Windows `Path` too); `process.env.PATH` by default. */
  path?: string;
  /** `process.platform` by default. */
  platform?: NodeJS.Platform;
}

/**
 * The absolute path of the program `name`, from the absolute folders of the
 * `PATH` in their order, so a starter never hands a bare name to the system.
 *
 * A relative folder such as `.` or `bin` is skipped: it would be read
 * against whatever folder the process is in, which may be the workspace.
 * On Windows only `<name>.exe` counts, never `<name>.cmd` or `<name>.bat`,
 * which need a shell to run, and the current folder (which Windows would
 * search first for a bare name) is never searched.
 *
 * An absolute `name` is checked and given back as it is. Any other name
 * with a folder in it, such as `./server` or `C:server`, is never found:
 * it would be read against the current folder too.
 *
 * @returns the program's absolute path, or `undefined` when no folder has it
 */
export async function findProgram(
  name: string,
  options: FindProgramOptions = {},
): Promise<string | undefined> {
  const platform = options.platform ?? process.platform;
  const searchPath = options.path ?? process.env["PATH"] ?? process.env["Path"] ?? "";
  for (const candidate of programCandidates(name, searchPath, platform)) {
    if (await isProgram(candidate, platform === "win32")) return candidate;
  }
  return undefined;
}

/**
 * Where the program `name` may be, in order: the name itself when it is an
 * absolute path, otherwise the name (`<name>.exe` on Windows) in each
 * absolute folder of `searchPath`. Nothing for a relative path.
 */
export function programCandidates(
  name: string,
  searchPath: string,
  platform: NodeJS.Platform,
): string[] {
  const windows = platform === "win32";
  const paths = windows ? win32 : posix;
  if (isAbsolutePath(name, platform)) {
    return !windows || hasExeExtension(name) ? [name] : [];
  }
  if (name === "" || hasFolder(name, windows)) return [];
  const fileName = windows && !hasExeExtension(name) ? `${name}.exe` : name;
  return searchPath
    .split(paths.delimiter)
    .filter((folder) => isAbsolutePath(folder, platform))
    .map((folder) => paths.join(folder, fileName));
}

/** Whether `name` names a folder too: a slash, a backslash on Windows, or a drive such as `C:`. */
function hasFolder(name: string, windows: boolean): boolean {
  return windows ? /[\\/:]/u.test(name) : name.includes("/");
}

function hasExeExtension(name: string): boolean {
  return name.toLowerCase().endsWith(".exe");
}

async function isProgram(candidate: string, windows: boolean): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) return false;
    // Windows has no execute bit: a file named `<name>.exe` is the program.
    if (!windows) await access(candidate, constants.X_OK);
    return true;
  } catch {
    // Missing or not executable here: try the next folder.
    return false;
  }
}
