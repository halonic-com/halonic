// The sandbox profile of a harness step in the run's container (requirement
// `runtime.container-profile`). The container is the run's alone and holds nothing of anyone
// else's, so the profile needs no denied paths: its folders are fixed container paths, its only
// way out is the bridge by name and the sites the agent's file allows, and its time limit ends
// before the run object's alarm must.

import type { HarnessAgent, HarnessProfile, HarnessProfileBuilder } from "@halonicjs/engine";
import type { HarnessBridge, SandboxBridge } from "@halonicjs/ports";
import { runContainerTimeCapMs } from "./run-container-limits.ts";
import { workerBridgeName } from "./worker-bridge-server.ts";

/** The container's folders the program uses: fixed, the same in every run's container. */
export const containerFolders = {
  /** Where the program works. It starts empty apart from what the run copies in. */
  working: "/work",
  /** The program's temp folder, which also holds the run's instruction and tool files. */
  temp: "/halonic/temp",
  /** The program's home folder. */
  home: "/halonic/home",
  /** The agent's settings folder, the only one the settings writer reaches besides the temp folder. */
  settings: "/halonic/home/.claude",
} as const;

/** Whether `path` is an absolute POSIX path with no empty, `.` or `..` part. */
function plainAbsolute(path: string): boolean {
  if (!path.startsWith("/")) return false;
  return path
    .slice(1)
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * The socket file of the container's bridge: none. The intercept, outside the container, routes
 * the bridge's name, so the program reaches it over HTTP and never opens a socket.
 */
const noSocketFile = "";

/**
 * The bridge as the container reaches it: by the name the intercept answers, over plain HTTP on
 * port 80. Any other address can't be reached from the container, so it is refused.
 */
function containerBridgeOf(bridge: HarnessBridge): SandboxBridge {
  const url = new URL(bridge.url);
  if (url.protocol !== "http:" || url.port !== "" || url.hostname !== workerBridgeName) {
    throw new Error(`A run container reaches its bridge only as http://${workerBridgeName}.`);
  }
  return { kind: "socket", name: workerBridgeName, socketPath: noSocketFile };
}

/**
 * Builds the profile of each harness step in a run's container: the fixed
 * {@link containerFolders}, the instructions folder read-only, the agent file's allowed sites and
 * the bridge by name, for at most {@link runContainerTimeCapMs}.
 *
 * @example
 * const { profile } = await containerProfiles.profileOf(agent, bridge, null);
 */
export const containerProfiles: HarnessProfileBuilder = {
  async profileOf(
    agent: HarnessAgent,
    bridge: HarnessBridge,
    instructionsFolder: string | null,
  ): Promise<HarnessProfile> {
    if (instructionsFolder !== null && !plainAbsolute(instructionsFolder)) {
      throw new Error(`The instructions folder ${instructionsFolder} isn't a container path.`);
    }
    return {
      profile: {
        workingFolder: containerFolders.working,
        tempFolder: containerFolders.temp,
        settingsFolder: containerFolders.settings,
        readOnlyPaths: instructionsFolder === null ? [] : [instructionsFolder],
        deniedPaths: [],
        env: { HOME: containerFolders.home, TMPDIR: containerFolders.temp },
        network: {
          bridge: containerBridgeOf(bridge),
          allowedSites: [...(agent.file.allowedSites ?? [])],
        },
        timeLimitMs: runContainerTimeCapMs,
      },
      deniedGroups: [],
    };
  },
};
