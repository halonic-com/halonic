import type { ServerConfig, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { helloResponse } from "./hello-route.ts";
import type { ManyUserPorts, ScopedRunPorts } from "./many-users-api.ts";
import { type Principal, scopeName } from "./principal.ts";
import { parseRunEndpoint, serveRunEndpoint } from "./run-endpoint.ts";
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

/** Answers a request that has a principal. */
type SignedInHandler = (
  request: Request,
  body: Uint8Array,
  scoped: ScopedRoutes,
) => Promise<Response>;

/** The routes of a many-user server, after the `Host`, `Origin`, daily and body checks. */
export interface ManyUserRoutes {
  route(request: Request, body: Uint8Array): Promise<Response>;
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

/**
 * The handler for an address that needs a session, or `null` when the address is none of them.
 * Every other route of an owner's server, `POST /api/login` included, has no place here and
 * answers 404: the password, the keys, the Google setup and the webhooks are the deployment's.
 */
function signedInHandlerFor(method: string, pathname: string): SignedInHandler | null {
  const endpoint = `${method} ${pathname}`;
  switch (endpoint) {
    case "GET /api/session":
      return sessionResponse;
    case `GET ${waitingRunsPath}`:
      return (_request, _body, { runRoutes }) => runRoutes.waiting();
    case "POST /api/runs":
    case "POST /api/agent-runs":
      return startHandler(endpoint === "POST /api/runs");
  }
  if (!pathname.startsWith(runPathPrefix)) {
    return null;
  }
  const runEndpoint = parseRunEndpoint(method, pathname.slice(runPathPrefix.length));
  return runEndpoint === null
    ? null
    : (request, body, scoped) => serveRunEndpoint(runEndpoint, request, body, scoped);
}

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

  return {
    async route(request, body) {
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/api/hello") {
        return helloResponse(config);
      }
      const handler = signedInHandlerFor(request.method, pathname);
      if (handler === null) {
        return (await studioPageRoutes?.serve(request)) ?? errorResponse(serverErrors.notFound);
      }
      // A verifier that throws goes up as a server error, never as "not signed in".
      const session = await verifySession(request, manyUsers);
      if (!session.ok) {
        return errorResponse(serverErrors.notSignedIn);
      }
      return handler(request, body, scopedRoutesOf(session.session.principal));
    },
  };
}
