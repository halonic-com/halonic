import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { settingsFolderBody } from "./harness-schemas.ts";
import { type HostHarnessProfiles, programHarnessOf } from "./host-profiles.ts";

/**
 * An agent's own settings folder, so Studio can check its sign-in and open
 * it there (HAL-6351): `POST /v1/harnesses/settings-folder` with
 * `{ workspace, agentId, harness }` answers `{ settingsFolder }`, the folder
 * a run of that agent uses, made and private.
 *
 * It answers 404 `unknown_workspace` for a folder the launcher didn't name,
 * 404 `unknown_harness`, 422 `no_sign_in` for a harness without a sign-in of
 * its own, and 422 `agent_id_refused` for an id that can't name a folder.
 */
export function settingsFolderRoute(profiles: HostHarnessProfiles): HostRoute {
  return {
    method: "POST",
    path: "/v1/harnesses/settings-folder",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, settingsFolderBody);
      if (body === undefined) return;
      const harness = programHarnessOf(body.harness);
      if (harness === undefined) {
        return sendError(response, 404, "unknown_harness", "The agent host has no such harness.");
      }
      let settingsFolder: string | null | undefined;
      try {
        settingsFolder = await profiles.settingsFolderOf(body.workspace, body.agentId, harness);
      } catch (error) {
        // Only an id the profile refuses is the caller's; a disk that fails is the host's.
        if (!(error instanceof RangeError)) throw error;
        return sendError(response, 422, "agent_id_refused", error.message);
      }
      if (settingsFolder === undefined) {
        return sendError(
          response,
          404,
          "unknown_workspace",
          "The agent host was not told to serve this workspace.",
        );
      }
      if (settingsFolder === null) {
        return sendError(response, 422, "no_sign_in", "This harness has no sign-in of its own.");
      }
      sendJson(response, 200, { settingsFolder });
    },
  };
}
