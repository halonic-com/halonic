import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { HostPlacements } from "./host-placements.ts";
import { keyBody, saveBody } from "./placement-schemas.ts";

const unnamed = "The agent host was not told to serve this workspace.";

/**
 * The "this computer" choices over loopback, so Studio can give the engine an
 * `AgentPlacementStore` whose files are the CLI's own: `POST /v1/placements/get`
 * answers `{ placement }` (`null` when there is none), `…/save` and `…/remove`
 * answer `{}`. A location that is not the real path of a workspace the
 * launcher named is 404 `unknown_workspace` and nothing is read or written. A
 * choice that exists but can't be read is 422 `placement_unreadable` with the
 * reason, so Studio runs the agent in a sandbox and says why.
 */
export function placementRoutes(placements: HostPlacements): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/placements/get",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, keyBody);
        if (body === undefined) return;
        try {
          const placement = await placements.get(body);
          if (placement === undefined)
            return sendError(response, 404, "unknown_workspace", unnamed);
          sendJson(response, 200, { placement });
        } catch (error) {
          sendError(response, 422, "placement_unreadable", reasonOf(error));
        }
      },
    },
    {
      method: "POST",
      path: "/v1/placements/save",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, saveBody);
        if (body === undefined) return;
        try {
          if (!(await placements.save(body))) {
            return sendError(response, 404, "unknown_workspace", unnamed);
          }
          sendJson(response, 200, {});
        } catch (error) {
          sendError(response, 422, "placement_refused", reasonOf(error));
        }
      },
    },
    {
      method: "POST",
      path: "/v1/placements/remove",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, keyBody);
        if (body === undefined) return;
        try {
          if (!(await placements.remove(body))) {
            return sendError(response, 404, "unknown_workspace", unnamed);
          }
          sendJson(response, 200, {});
        } catch (error) {
          sendError(response, 422, "placement_refused", reasonOf(error));
        }
      },
    },
  ];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
