import type { HarnessBridge } from "@halonicjs/ports";
import type { BridgeTable } from "../bridge/bridge-routes.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { profileBody } from "./harness-schemas.ts";
import { type HostHarnessProfiles, programHarnessOf } from "./host-profiles.ts";

/**
 * The harness profile builder over loopback, so Studio can give the engine a
 * `HarnessProfileBuilder` whose profile is built next to the sandbox:
 * `POST /v1/harnesses/profile` with `{ workspace, agent, bridge }` answers
 * `{ profile, deniedGroups }`, the engine's `HarnessProfile`.
 *
 * It answers 404 `unknown_workspace` for a folder the launcher didn't name,
 * 404 `unknown_harness` and 404 `unknown_bridge`, and 422 `profile_refused`
 * with the builder's own reason, such as a working folder that leaves the
 * workspace. Nothing is made for a request that is refused before the builder.
 */
export function profileRoute(profiles: HostHarnessProfiles, bridges: BridgeTable): HostRoute {
  return {
    method: "POST",
    path: "/v1/harnesses/profile",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, profileBody);
      if (body === undefined) return;
      const harness = programHarnessOf(body.agent.harness);
      const bridge: HarnessBridge | undefined = bridges.get(body.bridge)?.bridge;
      if (harness === undefined) {
        return sendError(response, 404, "unknown_harness", "The agent host has no such harness.");
      }
      if (bridge === undefined) {
        return sendError(
          response,
          404,
          "unknown_bridge",
          "The agent host has no open bridge with this id.",
        );
      }
      try {
        const built = await profiles.profileOf(body.workspace, { ...body.agent, harness }, bridge);
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
