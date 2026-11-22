import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import type { TrustStore } from "@halonicjs/ports";
import { type ProfileFolder, placementFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { type HostHarnessProfiles, webCryptoDigest } from "../harness/host-profiles.ts";
import type { ThisComputerLauncher } from "./this-computer-routes.ts";
import { UnfencedGate } from "./unfenced-gate.ts";

/** What the host's launcher for agents on this computer is built from. */
export interface HostThisComputerInput {
  /** The profile folder, where the person's choices are; `undefined` without one. */
  readonly profile: ProfileFolder | undefined;
  /** The host's profile builder, `undefined` without a profile folder. */
  readonly profiles: HostHarnessProfiles | undefined;
  readonly workspaceRoots: readonly string[];
  /** The trust records of the profile folder, `undefined` without one. */
  readonly trustStore: TrustStore | undefined;
  readonly platform: NodeJS.Platform;
}

/**
 * The launcher the host runs an agent on this computer with: the same
 * `createHostSandbox()` the CLI uses (HAL-13090), behind the host's own gate.
 * `undefined`, so the host offers none, without a profile folder (no
 * choices, trust records or profiles to check against) and on Windows,
 * where the host can't find a harness program yet, as for the sandbox.
 */
export function hostThisComputer(input: HostThisComputerInput): ThisComputerLauncher | undefined {
  const { profile, profiles, trustStore } = input;
  if (profile === undefined || profiles === undefined || trustStore === undefined) {
    return undefined;
  }
  if (input.platform === "win32") return undefined;
  return {
    // Its sessions remove their temp folders, and its open takes the profile from the unopened ones.
    launcher: profiles.removingTempFolders(createHostSandbox()),
    gate: new UnfencedGate({
      workspaceRoots: input.workspaceRoots,
      trustStore,
      placements: new FileAgentPlacementStore(placementFolder(profile)),
      profiles,
      digest: webCryptoDigest,
      clock: systemClock,
    }),
  };
}
