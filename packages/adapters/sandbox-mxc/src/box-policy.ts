// How a `SandboxProfile` becomes what MXC is told: the folders it grants, the
// network, the environment and the flags, following the grant rules from
// HAL-3503 and the ADR (docs/adr/2026-11-10-mxc-sandbox-backend.md, "How the
// adapter runs a program" and "The network: the bridge is MXC's proxy").

import { win32 } from "node:path";
import type { SandboxBridge, SandboxProfile } from "@halonicjs/ports";
import { symlinkFlags, windowsCommandLine } from "./command-line.ts";
import type { MxcDisk } from "./disk.ts";
import { deniedGrantPaths, grantPath, readOnlyGrants } from "./grant-path.ts";
import type { MxcNetwork, MxcRequest } from "./mxc-process.ts";

/**
 * What a box is allowed, as MXC will be told. Every path is in
 * {@link grantPath} form. A session builds it once from its profile, and
 * every program in the session starts under it.
 */
export interface BoxPolicy {
  workingFolder: string;
  readOnlyFolders: string[];
  /**
   * Read-only files of the profile. MXC grants only folders, so the session
   * copies them into a folder it owns and adds that folder to `readOnlyFolders`
   * (see {@link copyReadOnlyFiles}); {@link boxRequest} never grants these paths.
   */
  readOnlyFiles: string[];
  readWriteFolders: string[];
  deniedPaths: string[];
  /** Only what the profile gave, plus `TEMP`, `TMP` and the Node flags in `NODE_OPTIONS`. */
  environment: Record<string, string>;
  network: MxcNetwork;
}

/**
 * The policy for `profile`. Creates the temp and settings folders when they
 * aren't there, as the port says a session's temp folder is fresh.
 *
 * @throws when `allowedSites` isn't empty (SDK v1 has no rule per host name, so MXC never runs with the internet partly open)
 * @throws when `reopenedPaths` isn't empty (MXC's denied paths win over every grant, so it can't reopen one)
 * @throws when the bridge isn't a loopback bridge on `127.0.0.1` with a port
 * @throws when the working folder isn't a folder, or a path isn't one {@link grantPath} takes
 * @throws when a variable's name or value can't be passed on
 */
export async function boxPolicy(profile: SandboxProfile, disk: MxcDisk): Promise<BoxPolicy> {
  if (profile.network.allowedSites.length > 0) {
    throw new Error(
      "MXC can't allow single sites yet (its SDK has no rule per host name), so allowedSites must be empty.",
    );
  }
  if ((profile.reopenedPaths ?? []).length > 0) {
    throw new Error(
      "MXC can't reopen a path inside a denied path (its denied paths win over every grant), so reopenedPaths must be empty.",
    );
  }
  const network = networkOf(profile.network.bridge);
  const workingFolder = grantPath(profile.workingFolder);
  if ((await disk.kind(workingFolder)) !== "folder") {
    throw new Error(`The working folder "${workingFolder}" isn't a folder that is there.`);
  }
  const tempFolder = grantPath(profile.tempFolder);
  const settingsFolder = profile.settingsFolder === null ? null : grantPath(profile.settingsFolder);
  const ownFolders = settingsFolder === null ? [tempFolder] : [tempFolder, settingsFolder];
  for (const folder of ownFolders) await disk.makeFolder(folder);
  const readOnly = await readOnlyGrants(profile.readOnlyPaths, disk);
  return {
    workingFolder,
    readOnlyFolders: readOnly.folders,
    readOnlyFiles: readOnly.files,
    readWriteFolders: [...new Set([workingFolder, ...ownFolders])],
    deniedPaths: deniedGrantPaths(profile.deniedPaths),
    environment: boxEnvironment(profile.env, tempFolder),
    network,
  };
}

/**
 * The network of the first version: nothing leaves the box, and the bridge is
 * MXC's proxy, so it is the one local port the box reaches. No bridge means no
 * loopback at all. Never an egress rule: it doesn't reach the bridge, and
 * any rule adds the `internetClient` permission.
 */
function networkOf(bridge: SandboxBridge | null): MxcNetwork {
  if (bridge === null) {
    return { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } };
  }
  if (bridge.kind !== "loopback") {
    throw new Error("MXC serves only a loopback bridge, not a bridge on a socket.");
  }
  // `localhost` can resolve to `::1` first on Windows, and `::1` is untested.
  if (bridge.host !== "127.0.0.1") {
    throw new Error(`MXC takes only 127.0.0.1 as the bridge's host, not "${bridge.host}".`);
  }
  if (!Number.isInteger(bridge.port) || bridge.port < 1 || bridge.port > 65_535) {
    throw new Error(`The bridge's port, ${bridge.port}, isn't a port number.`);
  }
  return {
    egress: { default: "deny" },
    ingress: { default: "allow", hostLoopback: "allow" },
    runtimeConfig: { networkProxy: `http://127.0.0.1:${bridge.port}` },
  };
}

/** The variables the profile gave, never the host's. `TEMP` and `TMP` are the temp folder, and Node gets its flags (rule 3). */
function boxEnvironment(
  given: Readonly<Record<string, string>>,
  tempFolder: string,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(given)) {
    if (!/^[^=\0\s]+$/.test(name) || value.includes("\0")) {
      throw new Error(`The profile has a variable that can't be passed on: "${name}".`);
    }
    environment[name] = value;
  }
  // Windows names variables without regard to case, so `Temp` and `TEMP` are one.
  const nameOf = (wanted: string) =>
    Object.keys(environment).find((name) => name.toUpperCase() === wanted);
  const nodeOptionsName = nameOf("NODE_OPTIONS") ?? "NODE_OPTIONS";
  const nodeOptions = (environment[nodeOptionsName] ?? "")
    .split(/\s+/)
    .filter((flag) => flag !== "");
  for (const wanted of ["TEMP", "TMP"]) {
    delete environment[nameOf(wanted) ?? wanted];
    environment[wanted] = tempFolder;
  }
  const flags = symlinkFlags.filter((flag) => !nodeOptions.includes(flag));
  environment[nodeOptionsName] = [...nodeOptions, ...flags].join(" ");
  return environment;
}

/** The program to start in a box, and where. */
export interface BoxCommand {
  program: string;
  args: readonly string[];
  /** The folder it starts in, inside the working folder; the working folder when absent. */
  cwd?: string | undefined;
}

/**
 * The request for MXC's `spawn`: the policy, the command line, and the
 * time left for the whole session. The UI policy is on, with no clipboard and
 * no input injection (round 2 of HAL-2396).
 *
 * @throws when the command's folder isn't inside the working folder, or the command can't be written as a command line
 */
export function boxRequest(policy: BoxPolicy, command: BoxCommand, timeoutMs: number): MxcRequest {
  return {
    command: windowsCommandLine(command.program, command.args),
    workingDirectory: startFolder(policy.workingFolder, command.cwd),
    filesystem: {
      readonlyPaths: policy.readOnlyFolders,
      readwritePaths: policy.readWriteFolders,
      deniedPaths: policy.deniedPaths,
    },
    network: policy.network,
    ui: { disable: false, clipboard: "none", allowInputInjection: false },
    environment: policy.environment,
    inheritDefaultEnvironment: false,
    timeoutMs: Math.max(1, Math.floor(timeoutMs)),
  };
}

function startFolder(workingFolder: string, cwd: string | undefined): string {
  if (cwd === undefined) return workingFolder;
  const folder = grantPath(win32.resolve(workingFolder, cwd));
  if (!isInside(workingFolder, folder)) {
    throw new Error(`The program must start inside the working folder, not in ${folder}.`);
  }
  return folder;
}

/** Whether `path` is `folder` or inside it; both in {@link grantPath} form, compared without regard to case as Windows does. */
export function isInside(folder: string, path: string): boolean {
  const parent = folder.toLowerCase();
  const child = path.toLowerCase();
  return child === parent || child.startsWith(`${parent}\\`);
}
