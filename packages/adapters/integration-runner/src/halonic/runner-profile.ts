// The untrusted profile: the `Sandbox` profile a runner starts in (design
// HAL-958, section 5). No network, not even a loopback bridge. Read only the
// runtime and the code. Write only a private temp folder. The home folder and
// the socket folders a network namespace doesn't cover are hidden. The
// environment holds only `TMPDIR`. The OS key store is denied: on macOS the
// Keychain answers over Mach, past the file fence (attack case A36).
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
    },
  };
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
  const kept = [...readOnlyPaths, machine.tempFolder];
  refuseKeptHoldingHidden(files, machine);
  return {
    workingFolder: machine.tempFolder,
    tempFolder: machine.tempFolder,
    settingsFolder: null,
    readOnlyPaths,
    deniedPaths: [machine.homeFolder, ...machine.socketFolders].flatMap((folder) =>
      hiddenAround(folder, kept, disk),
    ),
    env: { TMPDIR: machine.tempFolder },
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: machine.timeLimitMs,
    keyStore: "denied",
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

/** Whether `path` is `folder` or inside it. Both are absolute. */
export function isInsideOrSame(path: string, folder: string): boolean {
  const way = relative(folder, path);
  return way === "" || (!isAbsolute(way) && way !== ".." && !way.startsWith(`..${sep}`));
}
