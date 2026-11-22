import type { ProgramHarness } from "@halonicjs/engine";
import type { HarnessBridge } from "@halonicjs/ports";
import type { BridgeTable } from "../bridge/bridge-routes.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { profileBody } from "./harness-schemas.ts";
import { type HostHarnessProfiles, programHarnessOf } from "./host-profiles.ts";

const unknownInstructionsMessage =
  "The agent host made no instructions folder at this path, or has removed it.";

/**
 * The harness profile builder over loopback, so Studio can give the engine a
 * `HarnessProfileBuilder` whose profile is built next to the sandbox:
 * `POST /v1/harnesses/profile` with `{ workspace, agent, bridge, instructionsFolder }` answers
 * `{ profile, deniedGroups }`, the engine's `HarnessProfile`.
 *
 * It answers 404 `unknown_workspace` for a folder the launcher didn't name,
 * 404 `unknown_harness`, 404 `unknown_bridge`, 404 `unknown_instructions` for
 * an instructions folder this host didn't make (see `isHostInstructions`), and 422 `profile_refused`
 * with the builder's own reason, such as a working folder that leaves the
 * workspace. Nothing is made for a request that is refused before the builder.
 */
export function profileRoute(
  profiles: HostHarnessProfiles,
  bridges: BridgeTable,
  isHostInstructions: (folder: string) => boolean,
): HostRoute {
  return {
    method: "POST",
    path: "/v1/harnesses/profile",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, profileBody);
      if (body === undefined) return;
      const named = namedInRequest(body, bridges, isHostInstructions);
      if ("unknown" in named) return sendError(response, 404, named.unknown, named.message);
      const { harness, bridge } = named;
      try {
        const built = await profiles.profileOf(
          body.workspace,
          { ...body.agent, harness },
          bridge,
          body.instructionsFolder,
        );
        if (built === undefined) {
          return sendError(
            response,
            404,
            "unknown_workspace",
            "The agent host was not told to serve this workspace.",
          );
        }
        sendJson(response, 200, built);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        sendError(response, 422, "profile_refused", reason);
      }
    },
  };
}

/**
 * The harness and bridge a profile request names, or what it names that the
 * host doesn't have, as a 404's kind and message: a harness, a bridge, or an
 * instructions folder the host didn't make.
 */
function namedInRequest(
  body: { agent: { harness: string }; bridge: string; instructionsFolder: string | null },
  bridges: BridgeTable,
  isHostInstructions: (folder: string) => boolean,
): { harness: ProgramHarness; bridge: HarnessBridge } | { unknown: string; message: string } {
  const harness = programHarnessOf(body.agent.harness);
  if (harness === undefined) {
    return { unknown: "unknown_harness", message: "The agent host has no such harness." };
  }
  const bridge = bridges.get(body.bridge)?.bridge;
  if (bridge === undefined) {
    return {
      unknown: "unknown_bridge",
      message: "The agent host has no open bridge with this id.",
    };
  }
  const folder = body.instructionsFolder;
  if (folder !== null && !isHostInstructions(folder)) {
    return { unknown: "unknown_instructions", message: unknownInstructionsMessage };
  }
  return { harness, bridge };
}
