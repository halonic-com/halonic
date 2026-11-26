import type { SyncCounters } from "@halonicjs/host-paperclip-sync";
import { type HostRoute, sendJson } from "../server/host-server.ts";

/**
 * `GET /v1/sync/diagnostics` (requirement `agent-host.sync-diagnostics`): the sync's counts and
 * timings over the last 24 hours, for every connection together, as Settings › Sync diagnostics
 * shows them. It answers counts and timings only: never a title, a body, an ID or a query.
 */
export function syncDiagnosticsRoute(counters: Pick<SyncCounters, "diagnostics">): HostRoute {
  return {
    method: "GET",
    path: "/v1/sync/diagnostics",
    handle: (_request, response) => sendJson(response, 200, counters.diagnostics()),
  };
}
