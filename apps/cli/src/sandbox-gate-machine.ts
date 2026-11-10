// The sandbox check's machine on this computer: the srt sandbox `halonic
// doctor` checks too, and the "On this computer" choices in the person's
// profile. `openWorkspaceEngine` reads the workspace's own part, its real
// path and its files, so a test only fakes the sandbox and the choices.

import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { AgentPlacement } from "@halonicjs/app";
import { type ProfileEnvironment, type ProfileFolder, profileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { SandboxGateMachine } from "./sandbox-gate.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";

/** What the sandbox check reads that isn't the workspace's: the sandbox and the person's choices. */
export type SandboxGateHost = Pick<SandboxGateMachine, "sandbox" | "placement">;

/**
 * The folder of the "On this computer" choices, `placements` in the profile
 * folder, never inside a workspace, so a pull can't make one (fs-node's
 * `FileAgentPlacementStore`).
 */
export function placementFolder(profile: ProfileFolder): string {
  return join(profile.root, "placements");
}

/**
 * This computer's sandbox and choices, in the profile from `environment`.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeSandboxGateHost(
  environment: ProfileEnvironment = nodeProfileEnvironment(),
): SandboxGateHost {
  const profile = profileFolder(environment);
  return {
    sandbox: new SrtSandbox(undefined, undefined, privateJournalFolder(profile)),
    placement: new AgentPlacement({
      store: new FileAgentPlacementStore(placementFolder(profile)),
      digest: webCryptoDigest,
      clock: systemClock,
    }),
  };
}

/**
 * The machine for the workspace in `root`: the host's sandbox and choices,
 * the choices keyed by the workspace's real path, and its files read from
 * the folder.
 */
export async function sandboxGateMachine(
  host: SandboxGateHost,
  root: string,
): Promise<SandboxGateMachine> {
  const location = await realpath(root);
  return {
    ...host,
    location,
    readFile: async (path) => new Uint8Array(await readFile(join(location, path))),
  };
}
