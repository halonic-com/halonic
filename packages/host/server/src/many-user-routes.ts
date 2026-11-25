import type { ServerConfig, ServerPorts } from "./api.ts";
import {
  type CloudSessionRoutes,
  cloudRefreshPath,
  cloudSignOutPath,
  createCloudSessionRoutes,
} from "./cloud-session-routes.ts";
import {
  type CloudSignInRoutes,
  cloudSignInReturnPath,
  cloudSignInStartPath,
  createCloudSignInRoutes,
} from "./cloud-sign-in-routes.ts";
import type { CountRequest } from "./daily-requests.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { helloResponse } from "./hello-route.ts";
import type { ManyUserPorts, ScopedRunPorts } from "./many-users-api.ts";
import { type Principal, scopeName } from "./principal.ts";
import { matchRoute, type RouteEntry, type RouteParams } from "./route-table.ts";
import { type RunEndpointRequest, serveRunEndpoint } from "./run-endpoint.ts";
import {
  createRunRoutes,
  isJsonRequest,
  type RunRoutes,
  runPathPrefix,
  waitingRunsPath,
} from "./run-routes.ts";
import { verifySession } from "./session-verifier.ts";
import { createStudioPageRoutes } from "./studio-page-routes.ts";
import { createTrustRoutes, type TrustRoutes } from "./trust-routes.ts";

/**
 * The deployment-wide ports the routes of a many-user server may use. It has no run ports on
 * purpose: a route gets those only from {@link ManyUserPorts.scopedRuns}, for the principal.
 */
export type DeploymentPorts = Pick<ServerPorts, "trust" | "errorLog" | "workspace" | "studioPage">;

/** What a signed-in request works with: its principal and the routes over that scope's runs. */
interface ScopedRoutes {
  readonly principal: Principal;
  readonly runRoutes: RunRoutes;
  readonly trustRoutes: TrustRoutes;
  readonly ports: ScopedRunPorts & Pick<ServerPorts, "errorLog">;
}

/** What a route open to anyone works with: the config and the Cloud sign-in routes, when set up. */
interface PublicParts {
  readonly config: ServerConfig;
  readonly cloudSignInRoutes: CloudSignInRoutes | null;
  readonly cloudSessionRoutes: CloudSessionRoutes | null;
}

/** Answers a request open to anyone; `null` hands it on to the Studio page, then 404. */
type PublicHandler = (request: Request, parts: PublicParts) => Promise<Response> | Response | null;

/** Answers a request that has a principal. */
type SignedInHandler = (
  request: Request,
  body: Uint8Array,
  scoped: ScopedRoutes,
  params: RouteParams,
) => Promise<Response>;

/** A route of a many-user server: open to anyone, or behind a session. */
type ManyUserRoute =
  | (RouteEntry<PublicHandler> & { readonly access: "public" })
  | (RouteEntry<SignedInHandler> & { readonly access: "signed-in" });

/** The routes of a many-user server, after the `Host`, `Origin` and body checks. */
export interface ManyUserRoutes {
  /** Answers one request; `countRequest` counts it against the daily ceiling once its session is proven. */
  route(request: Request, body: Uint8Array, countRequest: CountRequest): Promise<Response>;
}

/** `GET /api/session` for a signed-in caller: the scope and role, never the client. */
const sessionResponse: SignedInHandler = async (_request, _body, { principal }) => {
  const { scope, role } = principal;
  return Response.json({ signedIn: true, scope: scopeName(scope), role });
};

/** Starts a run in the principal's scope. A cross-site form can only send a non-JSON type, so it never starts one. */
function startHandler(isWorkflow: boolean): SignedInHandler {
  return async (request, body, { trustRoutes }) => {
    if (!isJsonRequest(request)) {
      return errorResponse(serverErrors.unsupportedMediaType);
    }
    return isWorkflow ? trustRoutes.startWorkflow(body) : trustRoutes.startAgent(body);
  };
}

/** One endpoint of the run named by the path's `:runId`. */
function runHandler(endpoint: RunEndpointRequest["endpoint"]): SignedInHandler {
  return async (request, body, scoped, { runId }) =>
    runId === undefined
      ? errorResponse(serverErrors.notFound)
      : serveRunEndpoint({ runId, endpoint }, request, body, scoped);
}

const runPath = `${runPathPrefix}:runId`;

/**
 * Every route of a many-user server. It answers only through this table. Every other route of an
 * owner's server, `POST /api/login` included, has no entry and answers 404: the password, the
 * keys, the Google setup and the webhooks are the deployment's.
 */
export const manyUserRouteTable: readonly ManyUserRoute[] = [
  {
    method: "GET",
    path: "/api/hello",
    access: "public",
    kind: "other",
    handler: (_request, { config }) => helloResponse(config),
  },
  ...[
    { method: "GET", path: cloudSignInStartPath },
    { method: "GET", path: cloudSignInReturnPath },
  ].map(({ method, path }) => ({
    method,
    path,
    access: "public" as const,
    kind: "other" as const,
    handler: ((request, { cloudSignInRoutes }) =>
      cloudSignInRoutes?.route(request) ?? null) satisfies PublicHandler,
  })),
  ...[cloudRefreshPath, cloudSignOutPath].map((path) => ({
    method: "POST",
    path,
    access: "public" as const,
    kind: "other" as const,
    handler: ((request, { cloudSessionRoutes }) =>
      cloudSessionRoutes?.route(request) ?? null) satisfies PublicHandler,
  })),
  {
    method: "GET",
    path: "/api/session",
    access: "signed-in",
    kind: "other",
    handler: sessionResponse,
  },
  {
    method: "GET",
    path: waitingRunsPath,
    access: "signed-in",
    kind: "run-list",
    handler: async (_request, _body, { runRoutes }) => runRoutes.waiting(),
  },
  {
    method: "POST",
    path: "/api/runs",
    access: "signed-in",
    kind: "run-start",
    handler: startHandler(true),
  },
  {
    method: "POST",
    path: "/api/agent-runs",
    access: "signed-in",
    kind: "run-start",
    handler: startHandler(false),
  },
  {
    method: "GET",
    path: runPath,
    access: "signed-in",
    kind: "run-read",
    handler: runHandler("GET "),
  },
  {
    method: "GET",
    path: `${runPath}/events`,
    access: "signed-in",
    kind: "run-read",
    handler: runHandler("GET events"),
  },
  {
    method: "POST",
    path: `${runPath}/events`,
    access: "signed-in",
    kind: "run-write",
    handler: runHandler("POST events"),
  },
  {
    method: "POST",
    path: `${runPath}/cancel`,
    access: "signed-in",
    kind: "run-write",
    handler: runHandler("POST cancel"),
  },
];

/**
 * Builds the routes of a server where each person signs in for their own scope. No route reads
 * a user or organisation id from the request: the principal comes from the session alone, and
 * the run ports from the principal alone.
 */
export function createManyUserRoutes(
  config: ServerConfig,
  deployment: DeploymentPorts,
  manyUsers: ManyUserPorts,
): ManyUserRoutes {
  const studioPageRoutes =
    deployment.studioPage === undefined ? null : createStudioPageRoutes(deployment.studioPage);
  const { trust, errorLog, workspace } = deployment;
  const cloudSignInRoutes =
    manyUsers.cloudSignIn === undefined
      ? null
      : createCloudSignInRoutes(manyUsers.cloudSignIn, {
          sessionCookieName: manyUsers.cookieName,
          errorLog,
        });
  const cloudSessionRoutes =
    manyUsers.cloudSignIn === undefined
      ? null
      : createCloudSessionRoutes(manyUsers.cloudSignIn, {
          sessionCookieName: manyUsers.cookieName,
          errorLog,
        });

  function scopedRoutesOf(principal: Principal): ScopedRoutes {
    const { runs, runStore } = manyUsers.scopedRuns(principal);
    const shown = workspace === undefined ? {} : { workspace };
    return {
      principal,
      runRoutes: createRunRoutes({ runs, runStore, trust, errorLog, ...shown }),
      trustRoutes: createTrustRoutes({ trust, runs }),
      ports: { runs, runStore, errorLog },
    };
  }

  const parts: PublicParts = { config, cloudSignInRoutes, cloudSessionRoutes };

  return {
    async route(request, body, countRequest) {
      const { pathname } = new URL(request.url);
      const match = matchRoute(manyUserRouteTable, request.method, pathname);
      const answer =
        match?.route.access === "public" ? await match.route.handler(request, parts) : null;
      if (answer !== null) {
        return answer;
      }
      if (match?.route.access !== "signed-in") {
        return (await studioPageRoutes?.serve(request)) ?? errorResponse(serverErrors.notFound);
      }
      // A verifier that throws goes up as a server error, never as "not signed in".
      const session = await verifySession(request, manyUsers);
      if (!session.ok) {
        return errorResponse(serverErrors.notSignedIn);
      }
      const overCeiling = await countRequest();
      if (overCeiling !== null) {
        return overCeiling;
      }
      const scoped = scopedRoutesOf(session.session.principal);
      return match.route.handler(request, body, scoped, match.params);
    },
  };
}
