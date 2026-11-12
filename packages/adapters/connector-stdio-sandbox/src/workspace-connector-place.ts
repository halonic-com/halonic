import { resolve } from "node:path";
import { type AgentWorkingFolders, refuseWorkingFolders } from "@halonicjs/adapter-mcp";
import { findProgram } from "@halonicjs/adapter-system-node";
import type { LocalToolPlace, PinnedRunner, StdioConfig } from "./local-tool-launch.ts";

/**
 * What the host knows when it sets up a session for one of a workspace's
 * `stdio` connectors (D45). Every path is absolute.
 */
export interface WorkspaceConnectorSetting {
  /** The connector's own new folder, the one it writes to. */
  readonly workingFolder: string;
  /** A fresh private temp folder for the session. */
  readonly tempFolder: string;
  /** The workspace the connector file is in. */
  readonly workspaceRoot: string;
  /** The working folder of every harness agent in the workspace, which the program may not read. */
  readonly agentWorkingFolders: readonly string[];
  /** What else the program may not reach, such as SSH keys and Halonic's own data. */
  readonly deniedPaths: readonly string[];
  /** The Halonic bridge, or `null` for none. */
  readonly bridge: LocalToolPlace["bridge"];
  /** How long the session may last, in milliseconds. */
  readonly timeLimitMs: number;
  /** The `PATH` the program gets: the host's own. */
  readonly path: string;
  /** For a pinned package: the runner the host found for it. */
  readonly runner?: PinnedRunner;
}

/**
 * Where a workspace connector runs in its session, built like a plugin
 * local tool's (`localToolLaunch` takes it) so both start the same way:
 *
 * - It writes only to its own new working and temp folders.
 * - A program the person already has, such as `node tools/mail.js`, reads
 *   the workspace, as its script and `node_modules` are there, but can't
 *   change it. A pinned package starts in its empty folder and doesn't read
 *   the workspace at all.
 * - It can't read any harness agent's working folder, so it can't load a
 *   file an agent wrote, even one it never names, such as `require("./lib")`
 *   or a `node_modules` link (Julian's condition on HAL-4739).
 * - It reaches the bridge and the sites the connector file names, and
 *   nothing else (`format.connector-sites`).
 *
 * @example
 * workspaceConnectorPlace(stdio, { workspaceRoot: "/w", agentWorkingFolders: ["/w/files/agents/writer"], … });
 * // { readOnlyPaths: ["/w"], deniedPaths: [ …, "/w/files/agents/writer"], sites: stdio.sites ?? [], … }
 */
export function workspaceConnectorPlace(
  stdio: StdioConfig,
  setting: WorkspaceConnectorSetting,
): LocalToolPlace {
  return {
    workingFolder: setting.workingFolder,
    tempFolder: setting.tempFolder,
    readOnlyPaths: stdio.pin === undefined ? [setting.workspaceRoot] : [],
    deniedPaths: [...new Set([...setting.deniedPaths, ...setting.agentWorkingFolders])],
    bridge: setting.bridge,
    sites: [...(stdio.sites ?? [])],
    timeLimitMs: setting.timeLimitMs,
    path: setting.path,
    ...(setting.runner === undefined ? {} : { runner: setting.runner }),
  };
}

/**
 * Refuses a workspace connector's start that would run or load a file from
 * a harness agent's working folder, the same check the start on this
 * computer makes (`format.working-folder-start`): on the start folder, the
 * program, its arguments and the `env` the connector file writes, and then
 * on the program as found on the session's `PATH`. The profile denies those
 * folders too; this check refuses the start before anything runs and says
 * why.
 *
 * @param startFolder - the absolute folder the program starts in
 * @throws the refusal, naming the working folder and how the start reaches it
 */
export async function refuseAgentFolderStart(
  stdio: StdioConfig,
  startFolder: string,
  setting: WorkspaceConnectorSetting,
): Promise<void> {
  const guard: AgentWorkingFolders = {
    workspaceRoot: setting.workspaceRoot,
    folders: setting.agentWorkingFolders,
  };
  const named = { cwd: startFolder, program: stdio.command, args: stdio.args, env: stdio.env };
  await refuseWorkingFolders(named, guard);
  // A folder of the PATH may be a working folder too.
  const found = await findProgram(stdio.command, { path: setting.path });
  if (found !== undefined) {
    await refuseWorkingFolders({ cwd: startFolder, program: found, args: [], env: {} }, guard);
  }
}

/**
 * Where a workspace connector's program starts: a pinned package in its own
 * empty working folder, as on this computer, and any other program in the
 * workspace, or the connector file's `cwd` in it.
 */
export function workspaceStartFolder(
  stdio: StdioConfig,
  setting: WorkspaceConnectorSetting,
): string {
  if (stdio.pin !== undefined) return setting.workingFolder;
  return resolve(setting.workspaceRoot, stdio.cwd ?? ".");
}
