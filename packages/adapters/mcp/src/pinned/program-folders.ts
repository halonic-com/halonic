import { posix, win32 } from "node:path";

/** Where the launcher looks for a runner, all from the app's own environment. */
export interface FolderSources {
  readonly platform: NodeJS.Platform;
  /** The app's own `PATH`, as it inherited it. */
  readonly path: string;
  /** The person's home folder, for the install folders under it. */
  readonly home: string | undefined;
  /** On Windows, `%ProgramFiles%` and `%APPDATA%`, for Node's and npm's install folders. */
  readonly programFiles?: string | undefined;
  readonly appData?: string | undefined;
  /**
   * The `PATH` the person's login shell sets, read once per app start. A
   * desktop app on macOS inherits a short `PATH` without the folders a
   * login profile adds, such as Homebrew's. `undefined` when it can't be read.
   */
  readonly loginShellPath: () => Promise<string | undefined>;
}

/** Install folders under the home folder that runners and Node are often in, on macOS and Linux. */
const homeFolders = [".local/bin", ".cargo/bin", ".volta/bin", ".bun/bin"];

/** System-wide install folders on macOS and Linux: Homebrew on Apple silicon, then on Intel. */
const systemFolders = ["/opt/homebrew/bin", "/usr/local/bin"];

/**
 * The folders to look for a runner in, in order and each once: the app's
 * own `PATH`, then on macOS the login shell's `PATH`, then the usual install
 * folders. Only absolute folders count: an empty or relative `PATH` entry
 * would mean the folder the app happens to run in.
 */
export async function programFolders(sources: FolderSources): Promise<string[]> {
  const path = sources.platform === "win32" ? win32 : posix;
  const lists = [split(sources.path, sources.platform)];
  if (sources.platform === "darwin") {
    lists.push(split((await sources.loginShellPath()) ?? "", sources.platform));
  }
  lists.push(installFolders(sources, path));
  const absolute = lists.flat().filter((folder) => path.isAbsolute(folder));
  return uniqueFolders(absolute, sources.platform);
}

/** `folders` in order, each once, compared without letter case on Windows. */
export function uniqueFolders(folders: readonly string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  return folders.filter((folder) => {
    const key = platform === "win32" ? folder.toLowerCase() : folder;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The folders in a `PATH`. On Windows, some installers write a folder in
 * quotes (`"%ProgramFiles%\nodejs"`), which Windows itself accepts, so
 * the quotes come off.
 */
function split(list: string, platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return list.split(":").filter((folder) => folder !== "");
  return list
    .split(";")
    .map((folder) => folder.replace(/^"(.*)"$/, "$1"))
    .filter((folder) => folder !== "");
}

function installFolders(sources: FolderSources, path: typeof posix): string[] {
  const { home, programFiles, appData } = sources;
  if (sources.platform === "win32") {
    return [
      ...(programFiles === undefined ? [] : [path.join(programFiles, "nodejs")]),
      ...(appData === undefined ? [] : [path.join(appData, "npm")]),
      ...(home === undefined
        ? []
        : [path.join(home, ".local", "bin"), path.join(home, ".cargo", "bin")]),
    ];
  }
  const underHome = home === undefined ? [] : homeFolders.map((folder) => path.join(home, folder));
  return [...systemFolders, ...underHome];
}
