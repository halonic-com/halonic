import { type HostRoute, sendJson } from "./host-server.ts";

/**
 * `GET /v1/health`: the host is up, and which version it is. The program that
 * started the host asks it once after the handshake, to check that the token
 * works before it relies on the host.
 */
export function healthRoute(version: string): HostRoute {
  return {
    method: "GET",
    path: "/v1/health",
    handle: (_request, response) => sendJson(response, 200, { ok: true, version }),
  };
}
