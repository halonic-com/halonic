import { type HostRoute, sendJson } from "../server/host-server.ts";

/**
 * `GET /v1/plugins/tools`: whether this build of the host can run plugin tools
 * at all, so Studio can leave out plugin cards and commands that would only be
 * refused (C3 on HAL-12374). The shipped single executable answers
 * `{ inThisBuild: false }`, as every `/v1/plugins/call` there answers
 * `not_in_this_build`. A code only: the route reads no disk and starts nothing.
 */
export function pluginToolsRoute(inThisBuild: boolean): HostRoute {
  return {
    method: "GET",
    path: "/v1/plugins/tools",
    handle: (_request, response) => sendJson(response, 200, { inThisBuild }),
  };
}
