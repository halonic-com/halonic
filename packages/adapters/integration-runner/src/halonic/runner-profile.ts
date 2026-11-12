// The untrusted profile: the `Sandbox` profile a runner starts in (design
// HAL-958, section 5). No network, not even a loopback bridge. Read only the
// runtime and the code. Write only a private temp folder. Every top-level
// folder is hidden except the system files Node and the fence's own shell
// need, and the home folder and the socket folders a network namespace
// doesn't cover are hidden as well. The environment holds only `TMPDIR`.
// The OS key store is denied: on macOS the Keychain answers over Mach, past
// the file fence (attack case A36).
//
// srt leaves reads open on Linux and macOS, so without hiding the top-level
// folders a runner past Node's layer could read anything outside the home
// folder, such as `/mnt/c` on WSL2 or a workspace in `/srv`. On Windows srt
// opens no reads by default, so there is nothing outside to hide.
//
// The code or the runtime often lives inside the home folder, and the temp
// folder often inside the shared `/tmp`. So on Linux and macOS the profile
// denies `/` as a whole and reopens the paths the runner needs
// (`SandboxProfile.reopenedPaths`). Nothing is listed, so a folder made after
// the profile is built is denied too (HAL-5808), and a file removed from
// `/tmp` before the fence is up can't break the start (HAL-6164). The reverse
// can't be done: a path the runner needs that is, or holds, a folder to hide
// would leave that folder readable, so the profile refuses it.
//
// On Windows a deny on a folder also takes the right to look at the folders
// on the way to a path inside it, and Node looks at each of them to resolve
// a script's path, so the runner couldn't start from a reopened folder
// (HAL-5644). So on Windows the profile denies every entry of a folder to
// hide that isn't on the way to a path the runner needs, by name, as it
// finds them when the profile is built, and reopens nothing. What is made
// in the home folder later is kept out by the home folder's own access
// list, which the sandbox reads only where a grant names (threat model 4.6,
// Known limits). A folder on the way that can't be listed fails the start
// there, because its entries couldn't be denied.
//
// The fence denies a path's real place as well as the path as written. So the
// profile works on real paths only: `realRunnerPaths` resolves every path
// before the profile is built, and an entry denied by name that is a symlink
// into what the runner needs (such as `~/.nvm/current`) is left alone,
// because denying its real place would hide the runner's own files.

import { readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";

/** Where the runner's files are. Every path is absolute. */
export interface RunnerFiles {
  /** The Node program that runs the runner. */
  readonly node: string;
  /** The folder Node is installed in, read-only inside the fence. */
  readonly nodeFolder: string;
  /** The runner, built to one file, read-only inside the fence. */
  readonly runnerFile: string;
  /** The integration's folder, read-only inside the fence. */
  readonly integrationFolder: string;
}

/** What the profile needs to know about this machine and this start. Every path is absolute. */
export interface RunnerMachine {
  /** The person's home folder, hidden. */
  readonly homeFolder: string;
  /** Socket folders to hide; see {@link socketFolders}. */
  readonly socketFolders: readonly string[];
  /**
   * The system files and folders the runner reads; everything else at the top
   * level is hidden. `null` where the fence opens no reads by default, so
   * nothing at the top level needs hiding. See {@link systemFiles}.
   */
  readonly systemFiles: readonly string[] | null;
  /** The sandbox's own files that run inside the fence, such as srt's seccomp helper, read-only. */
  readonly sandboxFolders: readonly string[];
  /** A fresh private temp folder for this start: the one folder the runner may write to. */
  readonly tempFolder: string;
  /** How long the runner may live, in milliseconds. */
  readonly timeLimitMs: number;
  /** The system, as `process.platform` names it; this one unless a test passes another. */
  readonly platform?: NodeJS.Platform;
}

/** What the profile reads from disk. */
export interface RunnerDisk {
  /** Lists the names in a folder, on Windows only; throws when it can't, such as a missing or unreadable folder. */
  listFolder(folder: string): readonly string[];
  /** The path with every symlink on it resolved; throws when it can't, such as a missing path. */
  realPath(path: string): string;
}

/** The disk the runner really starts from. */
export const diskOnThisMachine: RunnerDisk = {
  listFolder(folder) {
    try {
      return readdirSync(folder);
    } catch (error) {
      throw new Error(`can't list ${folder} to hide what's in it`, { cause: error });
    }
  },
  realPath: (path) => realpathSync.native(path),
};

/**
 * The socket folders a network namespace doesn't cover, for this machine's
 * environment: `/run`, `/var/run`, the shared `/tmp`, `$XDG_RUNTIME_DIR` and
 * the folder of `$SSH_AUTH_SOCK`.
 */
export function socketFolders(env: {
  readonly XDG_RUNTIME_DIR?: string | undefined;
  readonly SSH_AUTH_SOCK?: string | undefined;
}): string[] {
  const folders = ["/run", "/var/run", "/tmp"];
  if (env.XDG_RUNTIME_DIR) folders.push(env.XDG_RUNTIME_DIR);
  if (env.SSH_AUTH_SOCK) folders.push(dirname(env.SSH_AUTH_SOCK));
  return [...new Set(folders.filter((folder) => isAbsolute(folder)))];
}

/**
 * The system files Node and the fence's own shell (`bash` and `env`) need on
 * this platform: the programs and libraries, the dynamic loader's settings
 * and the time zone. Linux keeps `/proc` and `/dev`, which bubblewrap mounts
 * fresh for the session. macOS keeps `/dev` and the parts of `/System` that
 * hold the frameworks and the shared library cache, but not
 * `/System/Volumes/Data`, which reaches every file on the disk. Paths that
 * don't exist on a machine are left out when they are resolved.
 * `null` on Windows; see {@link RunnerMachine.systemFiles}.
 */
export function systemFiles(platform: NodeJS.Platform): readonly string[] | null {
  if (platform === "win32") return null;
  if (platform === "darwin") {
    return [
      "/usr",
      "/bin",
      "/dev",
      "/System/Library",
      "/System/Cryptexes",
      "/System/Volumes/Preboot/Cryptexes",
      "/private/var/db/dyld", // leak-guard: allow absolute-path macOS system folder
      "/private/var/db/timezone", // leak-guard: allow absolute-path macOS system folder
      "/private/var/select", // leak-guard: allow absolute-path macOS system folder
      "/private/etc/localtime",
    ];
  }
  return [
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib32",
    "/lib64",
    "/libx32",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/localtime",
    "/proc",
    "/dev",
  ];
}

/**
 * The same files and machine with every path resolved to its real place, so
 * that what the profile keeps and hides matches what the fence denies.
 * A folder to hide that doesn't exist stays as written; there is nothing in it.
 *
 * @throws when a path the runner needs can't be resolved, such as a missing runner file
 */
export function realRunnerPaths(
  files: RunnerFiles,
  machine: RunnerMachine,
  disk: RunnerDisk = diskOnThisMachine,
): { files: RunnerFiles; machine: RunnerMachine } {
  const needed = (name: string, path: string) => {
    try {
      return disk.realPath(path);
    } catch (error) {
      throw new Error(`can't find the ${name} ${path}`, { cause: error });
    }
  };
  const toHide = (folder: string) => {
    try {
      return disk.realPath(folder);
    } catch {
      return folder;
    }
  };
  const ifPresent = (path: string) => {
    try {
      return [disk.realPath(path)];
    } catch {
      return [];
    }
  };
  return {
    files: {
      node: needed("Node program", files.node),
      nodeFolder: needed("Node's folder", files.nodeFolder),
      runnerFile: needed("runner file", files.runnerFile),
      integrationFolder: needed("integration's folder", files.integrationFolder),
    },
    machine: {
      ...machine,
      homeFolder: toHide(machine.homeFolder),
      socketFolders: [...new Set(machine.socketFolders.map(toHide))],
      systemFiles:
        machine.systemFiles === null ? null : [...new Set(machine.systemFiles.flatMap(ifPresent))],
      sandboxFolders: machine.sandboxFolders.map((folder) => needed("sandbox's folder", folder)),
      tempFolder: needed("temp folder", machine.tempFolder),
    },
  };
}

/**
 * The untrusted profile for one runner start. Every path must already be real;
 * see {@link realRunnerPaths}.
 *
 * The system files are kept readable but not made read-only: the runner
 * writes to `/dev/null` like any program, and the fence keeps the rest of
 * them read-only anyway.
 *
 * @throws when a path the runner needs is, or holds, the home folder, a socket folder or `/`
 * @throws on Windows, when a folder on the way to a path the runner needs can't be listed
 */
export function runnerProfile(
  files: RunnerFiles,
  machine: RunnerMachine,
  disk: RunnerDisk = diskOnThisMachine,
): SandboxProfile {
  const readOnlyPaths = [
    files.nodeFolder,
    files.runnerFile,
    files.integrationFolder,
    ...machine.sandboxFolders,
  ];
  const kept = [...readOnlyPaths, machine.tempFolder, ...(machine.systemFiles ?? [])];
  refuseKeptHoldingHidden(files, machine);
  return {
    workingFolder: machine.tempFolder,
    tempFolder: machine.tempFolder,
    settingsFolder: null,
    readOnlyPaths,
    ...hiding(machine, kept, disk),
    env: { TMPDIR: machine.tempFolder },
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: machine.timeLimitMs,
    keyStore: "denied",
  };
}

/**
 * How the profile hides everything the runner doesn't need: each folder to
 * hide denied as a whole with the kept paths inside it reopened, or on
 * Windows denied around the kept paths by name (see the top of this file).
 * With `/` among the folders to hide, the home and socket folders inside it
 * need no entry of their own.
 */
function hiding(
  machine: RunnerMachine,
  kept: readonly string[],
  disk: RunnerDisk,
): Pick<SandboxProfile, "deniedPaths" | "reopenedPaths"> {
  const hidden = foldersToHide(machine);
  if ((machine.platform ?? process.platform) === "win32") {
    const byName = hidden.flatMap((folder) => hiddenAround(folder, kept, disk));
    return { deniedPaths: withoutNested(byName), reopenedPaths: [] };
  }
  const reopened = kept.filter((path) => hidden.some((folder) => isInsideOrSame(path, folder)));
  return { deniedPaths: withoutNested(hidden), reopenedPaths: [...new Set(reopened)] };
}

/** The folders the profile hides, around what the runner needs: `/` when the fence opens reads by default, the home folder and the socket folders. */
function foldersToHide(machine: RunnerMachine): string[] {
  const root = machine.systemFiles === null ? [] : ["/"];
  return [...root, machine.homeFolder, ...machine.socketFolders];
}

/**
 * The paths without repeats and without those inside another one, such as a
 * socket folder inside the home folder: a path inside one that is hidden
 * needs no entry of its own.
 */
function withoutNested(paths: readonly string[]): string[] {
  const unique = new Set(paths);
  const insideAnother = (path: string) => {
    for (let parent = dirname(path); parent !== path; path = parent, parent = dirname(path)) {
      if (unique.has(parent)) return true;
    }
    return false;
  };
  return [...unique].filter((path) => !insideAnother(path));
}

/**
 * The paths that hide `folder` while leaving each path in `kept` reachable:
 * `folder` itself when nothing kept is inside it, otherwise every entry that
 * isn't on the way to a kept path. Nothing when `folder` is inside a kept path.
 * `folder` and `kept` are real paths.
 */
export function hiddenAround(
  folder: string,
  kept: readonly string[],
  disk: RunnerDisk = diskOnThisMachine,
): string[] {
  if (kept.some((path) => isInsideOrSame(folder, path))) return [];
  const keptInside = kept.filter((path) => isInsideOrSame(path, folder));
  if (keptInside.length === 0) return [folder];
  return disk.listFolder(folder).flatMap((name) => {
    const entry = join(folder, name);
    const onTheWay = keptInside.some((path) => isInsideOrSame(path, entry));
    if (onTheWay) return hiddenAround(entry, keptInside, disk);
    return linksToKept(entry, kept, disk) ? [] : [entry];
  });
}

/**
 * Whether `entry` is a symlink whose real place is inside a kept path or
 * holds one. Hiding it would deny that real place too. Leaving it is safe:
 * whatever it reaches outside the kept paths is hidden at its real place.
 * An entry that can't be resolved, such as a broken symlink, is not one.
 */
function linksToKept(entry: string, kept: readonly string[], disk: RunnerDisk): boolean {
  let real: string;
  try {
    real = disk.realPath(entry);
  } catch {
    return false;
  }
  if (real === entry) return false;
  return kept.some((path) => isInsideOrSame(real, path) || isInsideOrSame(path, real));
}

/**
 * Refuses a path the runner needs that is, or holds, a folder to hide, such as
 * an integration built straight in the home folder or Node's folder set to
 * `/`. The profile can't hide such a folder, so the start must not go ahead.
 */
function refuseKeptHoldingHidden(files: RunnerFiles, machine: RunnerMachine): void {
  const keptByName: [string, string][] = [
    ["Node's folder", files.nodeFolder],
    ["runner file", files.runnerFile],
    ["integration's folder", files.integrationFolder],
    ["temp folder", machine.tempFolder],
    ...machine.sandboxFolders.map((path): [string, string] => ["sandbox's folder", path]),
    ...(machine.systemFiles ?? []).map((path): [string, string] => ["system file", path]),
  ];
  const hidden = foldersToHide(machine);
  for (const [name, path] of keptByName) {
    const held = hidden.find((folder) => isInsideOrSame(folder, path));
    if (held !== undefined) {
      throw new Error(
        `the ${name} ${path} is or holds ${held}, which the runner's fence must hide`,
      );
    }
  }
}

/** Whether `path` is `folder` or inside it. Both are absolute. */
export function isInsideOrSame(path: string, folder: string): boolean {
  const way = relative(folder, path);
  return way === "" || (!isAbsolute(way) && way !== ".." && !way.startsWith(`..${sep}`));
}
