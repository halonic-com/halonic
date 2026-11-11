// The untrusted profile: the `Sandbox` profile a runner starts in (design
// HAL-958, section 5). No network, not even a loopback bridge. Read only the
// runtime and the code. Write only a private temp folder. On Linux and macOS,
// where the fence leaves reads open, everything else is hidden too, except
// the system paths Node and the sandbox need (`systemPaths`). The home folder
// and the socket folders a network namespace doesn't cover are hidden on every
// system. The environment holds only `TMPDIR`.
//
// A profile can't allow a path inside a denied one, and the code or the
// runtime often lives inside the home folder. So a folder to hide that holds
// one of them is not hidden as a whole: every entry in it is hidden except
// the ones on the way to what the runner needs, down to that path itself.
// The reverse can't be done: a path the runner needs that is, or holds, a
// folder to hide would leave that folder readable, so the profile refuses it.
// A folder on the way that can't be listed fails the start too, because its
// entries couldn't be hidden.
//
// The fence denies a path's real place as well as the path as written. So the
// profile works on real paths only: `realRunnerPaths` resolves every path
// before the profile is built, and an entry to hide that is a symlink into
// what the runner needs (such as `~/.nvm/current`) is left alone, because
// denying its real place would hide the runner's own files.

import { readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";

/** The root hidden around the kept paths. Only Linux and macOS hide it; see {@link RunnerMachine.systemPaths}. */
const rootFolder = "/";

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
  /** A fresh private temp folder for this start: the one folder the runner may write to. */
  readonly tempFolder: string;
  /**
   * The system paths left readable besides the runner's own files: the ones
   * Node needs (see {@link systemPaths}) and the sandbox's own files it runs
   * inside the fence. Everything else is hidden. `null` where the fence reads
   * only what it names (Windows), so nothing more needs hiding there.
   */
  readonly systemPaths: readonly string[] | null;
  /** How long the runner may live, in milliseconds. */
  readonly timeLimitMs: number;
}

/** What the profile reads from disk. */
export interface RunnerDisk {
  /** Lists the names in a folder; throws when it can't, such as a missing or unreadable folder. */
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
 * The system paths Node needs on this kind of system: its libraries and the
 * loader's cache, the time zone, and the device and process folders. On macOS
 * also the shell it starts a program through, and the system's own folders
 * without the data volume, which holds the home folders under another name.
 * A path that doesn't exist on this machine is left out by
 * {@link realRunnerPaths}. `null` on Windows; see {@link RunnerMachine.systemPaths}.
 */
export function systemPaths(platform: NodeJS.Platform = process.platform): string[] | null {
  if (platform === "win32") return null;
  if (platform === "darwin") {
    return [
      "/usr",
      "/bin",
      "/sbin",
      "/dev",
      "/System/Library",
      "/System/Cryptexes",
      "/System/Volumes/Preboot/Cryptexes",
      "/private/etc",
      "/private/var/db/timezone", // leak-guard: allow absolute-path a macOS system folder
      "/private/var/db/dyld", // leak-guard: allow absolute-path a macOS system folder
      "/private/var/select", // leak-guard: allow absolute-path a macOS system folder
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
    "/dev",
    "/proc",
    "/sys",
  ];
}

/**
 * The same files and machine with every path resolved to its real place, so
 * that what the profile keeps and hides matches what the fence denies.
 * A folder to hide that doesn't exist stays as written; there is nothing in it.
 * A system path that doesn't exist is left out.
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
      tempFolder: needed("temp folder", machine.tempFolder),
      systemPaths:
        machine.systemPaths === null ? null : existingRealPaths(machine.systemPaths, disk),
    },
  };
}

/** The real places of the paths that exist, each once. */
function existingRealPaths(paths: readonly string[], disk: RunnerDisk): string[] {
  const real = paths.flatMap((path) => {
    try {
      return [disk.realPath(path)];
    } catch {
      return [];
    }
  });
  return [...new Set(real)];
}

/**
 * The untrusted profile for one runner start. Every path must already be real;
 * see {@link realRunnerPaths}.
 *
 * @throws when a path the runner needs is, or holds, the home folder or a socket folder
 * @throws when a folder on the way to a path the runner needs can't be listed
 */
export function runnerProfile(
  files: RunnerFiles,
  machine: RunnerMachine,
  disk: RunnerDisk = diskOnThisMachine,
): SandboxProfile {
  const readOnlyPaths = [files.nodeFolder, files.runnerFile, files.integrationFolder];
  const kept = [...readOnlyPaths, machine.tempFolder, ...(machine.systemPaths ?? [])];
  refuseKeptHoldingHidden(files, machine);
  const toHide = [machine.homeFolder, ...machine.socketFolders];
  if (machine.systemPaths !== null) toHide.push(rootFolder);
  return {
    workingFolder: machine.tempFolder,
    tempFolder: machine.tempFolder,
    settingsFolder: null,
    readOnlyPaths,
    deniedPaths: outermost(toHide.flatMap((folder) => hiddenAround(folder, kept, disk))),
    env: { TMPDIR: machine.tempFolder },
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: machine.timeLimitMs,
  };
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
  const keptByName = {
    "Node's folder": files.nodeFolder,
    "runner file": files.runnerFile,
    "integration's folder": files.integrationFolder,
    "temp folder": machine.tempFolder,
  };
  const hidden = [machine.homeFolder, ...machine.socketFolders];
  for (const [name, path] of Object.entries(keptByName)) {
    const held = hidden.find((folder) => isInsideOrSame(folder, path));
    if (held !== undefined) {
      throw new Error(
        `the ${name} ${path} is or holds ${held}, which the runner's fence must hide`,
      );
    }
  }
}

/**
 * The paths without those inside another one, each once. The home folder is
 * hidden from the root as well, and a deny inside a denied folder adds nothing.
 */
function outermost(paths: readonly string[]): string[] {
  // By parents, not pairs: a shared temp folder can hold thousands of entries.
  const unique = new Set(paths);
  return [...unique].filter((path) => !parentsOf(path).some((parent) => unique.has(parent)));
}

/** The folders `path` is in, nearest first, up to the root. */
function parentsOf(path: string): string[] {
  const parents: string[] = [];
  let current = path;
  while (dirname(current) !== current) {
    current = dirname(current);
    parents.push(current);
  }
  return parents;
}

/** Whether `path` is `folder` or inside it. Both are absolute. */
export function isInsideOrSame(path: string, folder: string): boolean {
  const way = relative(folder, path);
  return way === "" || (!isAbsolute(way) && way !== ".." && !way.startsWith(`..${sep}`));
}
