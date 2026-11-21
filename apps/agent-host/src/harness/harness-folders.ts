// What the host keeps in Halonic's data folder for Studio's harness runs
// (HAL-10849): the profile builder, the proposal folders and decisions, the
// placement choices and the instructions folders, each served over its own
// routes.
// All of them need the profile folder; without one, none is served.

import type { Harness } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import type { BridgeTable } from "../bridge/bridge-routes.ts";
import type { HostRoute } from "../server/host-server.ts";
import { hostRunInstructions } from "./host-instructions.ts";
import { hostPlacements } from "./host-placements.ts";
import { type HostHarnessProfiles, hostHarnessProfiles } from "./host-profiles.ts";
import { hostProposalFolders } from "./host-proposals.ts";
import { instructionRoutes } from "./instruction-routes.ts";
import { placementRoutes } from "./placement-routes.ts";
import { profileRoute } from "./profile-route.ts";
import { proposalDecisionRoutes } from "./proposal-decision-routes.ts";
import { proposalRoutes } from "./proposal-routes.ts";
import { ProposalUndoSteps } from "./proposal-undo-steps.ts";
import { settingsFolderRoute } from "./settings-folder-route.ts";

/** The harness folders' routes, and the profile builder, whose sessions the sandbox routes open. */
export interface HarnessFolders {
  /** `undefined` without a profile folder. */
  readonly profiles: HostHarnessProfiles | undefined;
  readonly routes: readonly HostRoute[];
  /** Removes what the runs left; call it once no program runs any more. */
  stop(): Promise<void>;
}

/**
 * @param workspaceRoots - the folders the launcher named as workspaces: no other gets folders
 * @param log - hears what can't be removed or ended, as text for standard error
 */
export function harnessFolders(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  harnesses: readonly Harness[],
  bridges: BridgeTable,
  log: (text: string) => void,
): HarnessFolders {
  const profiles = hostHarnessProfiles(profile, workspaceRoots, harnesses, log);
  const proposals = hostProposalFolders(profile, workspaceRoots, log);
  const placements = hostPlacements(profile, workspaceRoots);
  const instructions = hostRunInstructions(profile, workspaceRoots);
  return {
    profiles,
    routes: [
      ...(profiles === undefined
        ? []
        : [profileRoute(profiles, bridges), settingsFolderRoute(profiles)]),
      ...(proposals === undefined
        ? []
        : [
            ...proposalRoutes(proposals),
            ...proposalDecisionRoutes(proposals, new ProposalUndoSteps(() => crypto.randomUUID())),
          ]),
      ...(placements === undefined ? [] : placementRoutes(placements)),
      ...(instructions === undefined ? [] : instructionRoutes(instructions)),
    ],
    stop: async () => {
      await instructions?.stop();
      // Last: no run uses a proposal folder any more, so their git can stop.
      await proposals?.close();
    },
  };
}
