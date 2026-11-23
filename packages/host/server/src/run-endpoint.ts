import type { ServerPorts } from "./api.ts";
import { streamRunEvents } from "./event-stream.ts";
import { parseRunId, type RunRoutes } from "./run-routes.ts";

/** The endpoints of one run, by method and the action after its id. */
type RunEndpoint = "GET " | "GET events" | "POST events" | "POST cancel";

const runEndpoints: ReadonlySet<string> = new Set([
  "GET ",
  "GET events",
  "POST events",
  "POST cancel",
]);

/** One run's endpoint, read from the request's method and the path after `/api/runs/`. */
export interface RunEndpointRequest {
  readonly runId: string;
  readonly endpoint: RunEndpoint;
}

/**
 * Reads `/api/runs/<runId>` or `/api/runs/<runId>/<action>`. Checked before the session, so an
 * unknown address answers 404 whether the caller is signed in or not.
 *
 * @returns the run and endpoint, or `null` when the address is no run endpoint
 */
export function parseRunEndpoint(method: string, rest: string): RunEndpointRequest | null {
  const [segment, action, ...more] = rest.split("/");
  const runId = parseRunId(segment ?? "");
  const endpoint = `${method} ${action ?? ""}`;
  if (runId === null || more.length > 0 || !runEndpoints.has(endpoint)) {
    return null;
  }
  return { runId, endpoint: endpoint as RunEndpoint };
}

/** Answers one run endpoint, for a caller that is already signed in. */
export function serveRunEndpoint(
  { runId, endpoint }: RunEndpointRequest,
  request: Request,
  body: Uint8Array,
  routes: {
    readonly runRoutes: RunRoutes;
    readonly ports: Pick<ServerPorts, "runs" | "runStore" | "errorLog">;
  },
): Promise<Response> {
  switch (endpoint) {
    case "GET ":
      return routes.runRoutes.summary(runId);
    case "GET events":
      return streamRunEvents(routes.ports, request, runId);
    case "POST events":
      return routes.runRoutes.send(request, runId, body);
    default:
      return routes.runRoutes.cancel(request, runId);
  }
}
