import { join } from "node:path";
import { FileAgentPlacementStore, FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import type { Sandbox, TrustStore } from "@halonicjs/ports";
import { type ProfileFolder, placementFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { HostRunInstructions } from "../harness/host-instructions.ts";
import { type HostHarnessProfiles, webCryptoDigest } from "../harness/host-profiles.ts";
import type { HostProposalFolders } from "../harness/host-proposals.ts";
import type { ThisComputerLauncher } from "./this-computer-routes.ts";
import { UnfencedGate } from "./unfenced-gate.ts";

/** What the host's launcher for agents on this computer is built from: its own records, all from the profile folder. */
export interface HostThisComputerInput {
  /** The profile folder, where the person's choices and trust records are; `undefined` without one. */
  readonly profile: ProfileFolder | undefined;
  /** The host's profile builder, `undefined` without a profile folder. */
  readonly profiles: HostHarnessProfiles | undefined;
  /** The instruction folders the host makes, `undefined` without a profile folder. */
  readonly instructions: HostRunInstructions | undefined;
  /** The proposal folders the host makes, `undefined` without a profile folder. */
  readonly proposals: HostProposalFolders | undefined;
  readonly workspaceRoots: readonly string[];
  /** The trust records of the profile folder, `undefined` without one. */
  readonly trustStore: TrustStore | undefined;
  readonly platform: NodeJS.Platform;
  /** The launcher; the CLI's own, `createHostSandbox()`, when left out. Tests pass a fake. */
  readonly launcher?: Sandbox;
}

/**
 * The launcher the host runs an agent on this computer with: the same
 * `createHostSandbox()` the CLI uses (HAL-13090), behind the host's own gate.
 *
 * `undefined`, so the host offers none, without a profile folder (no
 * choices, trust records or profiles to check against) and on Windows,
 * where the profile builder can't find a harness program yet.
 */
export function hostThisComputer(input: HostThisComputerInput): ThisComputerLauncher | undefined {
  const { profile, profiles, instructions, proposals, trustStore } = input;
  if (
    profile === undefined ||
    profiles === undefined ||
    instructions === undefined ||
    proposals === undefined ||
    trustStore === undefined
  ) {
    return undefined;
  }
  if (input.platform === "win32") return undefined;
  return {
    // Its sessions remove the temp folders the builder made for them.
    launcher: profiles.removingTempFolders(input.launcher ?? createHostSandbox()),
    built: profiles,
    gate: new UnfencedGate({
      workspaceRoots: input.workspaceRoots,
      trustStore,
      placements: new FileAgentPlacementStore(placementFolder(profile)),
      profiles,
      instructions,
      // The folder Studio's trust dialog and the CLI's `halonic trust instructions` write.
      instructionTrust: new FileInstructionTrustStore(join(profile.root, "instruction-trust")),
      proposals,
      digest: webCryptoDigest,
      clock: systemClock,
    }),
  };
}
