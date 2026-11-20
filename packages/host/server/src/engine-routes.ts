import { runExecutorVersion } from "@halonicjs/ports";
import type { ServerPorts } from "./api.ts";
import type { EngineHelloBody, EngineRoutines } from "./engine-api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { streamRunEvents } from "./event-stream.ts";
import { createRoutineRoutes } from "./routine-routes.ts";
import { createRunRoutes, isJsonRequest, parseRunId, waitingRunsPath } from "./run-routes.ts";
import { type RunUpdates, streamRunUpdates } from "./run-updates.ts";
import { createTrustRoutes } from "./trust-routes.ts";

/** What the engine role's routes need: the run routes' ports, the workspace's routines and the feed of run changes. */
export type EngineRoutePorts = Pick<
  ServerPorts,
  "runs" | "runStore" | "trust" | "errorLog" | "clock"
> & { readonly routines: EngineRoutines; readonly runUpdates: RunUpdates };

/** One route of the engine role. There is no token-free kind: every route needs the launch token. */
export interface EngineRoute {
  readonly method: "GET" | "POST";
  /** The path, with `<name>` standing for one segment, such as `/api/runs/<runId>/events`. */
  readonly path: string;
  /** Answers a request whose path matched; `segments` are its `<name>` parts, in order. */
  handle(request: Request, segments: readonly string[], body: Uint8Array): Promise<Response>;
}

type RunHandler = (request: Request, runId: string, body: Uint8Array) => Promise<Response>;

/**
 * Every route the engine role serves, built from the route factories: its own
 * hello, the run routes, the run-updates stream and the two routine routes,
 * nothing else. It never takes
 * `createServer`'s set, so no trust, provider-key, webhook, connector-call,
 * chat-turn, Google, workspace or page route is ever served (security review
 * on HAL-14212). A test lists these and fails if another appears.
 */
export function engineRoutes(ports: EngineRoutePorts): readonly EngineRoute[] {
  const runRoutes = createRunRoutes(ports);
  const trustRoutes = createTrustRoutes(ports);
  const routineRoutes = createRoutineRoutes(ports);

  /** A run route, given the run id from the address; a segment that isn't one answers 404. */
  const forRun =
    (serve: RunHandler): EngineRoute["handle"] =>
    async (request, [segment], body) => {
      const runId = parseRunId(segment ?? "");
      return runId === null ? errorResponse(serverErrors.notFound) : serve(request, runId, body);
    };

  /** A start, which takes only a JSON body, so a cross-site form never starts a run. */
  const start =
    (serve: (body: Uint8Array) => Promise<Response>): EngineRoute["handle"] =>
    async (request, _segments, body) =>
      isJsonRequest(request) ? serve(body) : errorResponse(serverErrors.unsupportedMediaType);

  // Only the executor version: unlike `serve`'s hello, it names no product or version to a port scanner.
  const hello: EngineHelloBody = { runExecutorVersion };

  return [
    { method: "GET", path: "/api/hello", handle: async () => Response.json(hello) },
    { method: "POST", path: "/api/runs", handle: start(trustRoutes.startWorkflow) },
    { method: "POST", path: "/api/agent-runs", handle: start(trustRoutes.startAgent) },
    { method: "GET", path: waitingRunsPath, handle: () => runRoutes.waiting() },
    {
      method: "GET",
      path: "/api/runs/<runId>",
      handle: forRun(async (_request, runId) => runRoutes.summary(runId)),
    },
    {
      method: "GET",
      path: "/api/runs/<runId>/events",
      handle: forRun(async (request, runId) => streamRunEvents(ports, request, runId)),
    },
    { method: "POST", path: "/api/runs/<runId>/events", handle: forRun(runRoutes.send) },
    {
      method: "POST",
      path: "/api/runs/<runId>/cancel",
      handle: forRun(async (request, runId) => runRoutes.cancel(request, runId)),
    },
    {
      method: "GET",
      path: "/api/run-updates",
      handle: async (request) => streamRunUpdates(ports.runUpdates, request),
    },
    { method: "GET", path: "/api/routines", handle: () => routineRoutes.list() },
    {
      method: "POST",
      path: "/api/routines/<scope>/<routine>/run",
      handle: (request, [scope, routine], body) =>
        routineRoutes.runNow(request, scope ?? "", routine ?? "", body),
    },
  ];
}

/** A route that matched a request, with the segments its `<name>` parts stand for. */
export interface EngineRouteMatch {
  readonly route: EngineRoute;
  readonly segments: readonly string[];
}

/** The route that serves `method` and `pathname`, or `undefined` when none does. */
export function findEngineRoute(
  routes: readonly EngineRoute[],
  method: string,
  pathname: string,
): EngineRouteMatch | undefined {
  const parts = pathname.split("/");
  for (const route of routes) {
    const pattern = route.path.split("/");
    if (route.method !== method || pattern.length !== parts.length) continue;
    const segments: string[] = [];
    const matches = pattern.every((expected, index) => {
      const actual = parts[index] ?? "";
      if (!expected.startsWith("<")) return actual === expected;
      segments.push(actual);
      return actual !== "";
    });
    if (matches) return { route, segments };
  }
  return undefined;
}
