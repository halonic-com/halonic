import { type HostRoute, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { PluginRunStates } from "./plugin-run-states.ts";
import { pluginRunStateBody } from "./plugin-schemas.ts";

/**
 * Whether a plugin's runner stopped because the sandbox failed while it ran,
 * for the plugin page's R15 (HAL-15113, the "Runs" line design on HAL-1873,
 * `rl-page-stopped`):
 *
 * - `POST /v1/plugins/run-state` with `{ plugin }` answers
 *   `{ stopped: true, stoppedAt }` or `{ stopped: false }`, as codes only;
 * - `POST /v1/plugins/run-state/check-again` with `{ plugin }` forgets the
 *   stop and answers `{ stopped: false }`, so the next call tries the sandbox
 *   again. It never starts anything and never lets code run without the
 *   sandbox: every start still goes through the gate.
 *
 * The plugin goes by id in a strict body, as for `/v1/plugins/call`. Any id
 * with no stop answers `stopped: false`: the routes read no disk, so they
 * don't tell which plugins are installed.
 */
export function pluginRunStateRoutes(states: PluginRunStates): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/plugins/run-state",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, pluginRunStateBody);
        if (body === undefined) return;
        sendJson(response, 200, states.stateOf(body.plugin));
      },
    },
    {
      method: "POST",
      path: "/v1/plugins/run-state/check-again",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, pluginRunStateBody);
        if (body === undefined) return;
        states.forget(body.plugin);
        sendJson(response, 200, states.stateOf(body.plugin));
      },
    },
  ];
}
