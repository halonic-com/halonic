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
import {
  cancelHandler,
  eventsHandler,
  type ScopedRoutes,
  type SignedInHandler,
  sendHandler,
  startHandler,
  summaryHandler,
  waitingHandler,
} from "./many-user-run-routes.ts";
import type { ManyUserPorts } from "./many-users-api.ts";
import { type Principal, scopeName } from "./principal.ts";
import { matchRoute, type RouteEntry } from "./route-table.ts";
import { unrecordedOwnership } from "./run-access.ts";
import { createRunRoutes, runPathPrefix, waitingRunsPath } from "./run-routes.ts";
import { verifySession } from "./session-verifier.ts";
import { createTrustRoutes } from "./trust-routes.ts";

/**
 * The deployment-wide ports the routes of a many-user server may use. It has no run ports on
 * purpose: a route gets those only from {@link ManyUserPorts.scopedRuns}, for the principal.
 */
export type DeploymentPorts = Pick<ServerPorts, "trust" | "errorLog" | "workspace">;

/** What a route open to anyone works with: the config and the Cloud sign-in routes, when set up. */
interface PublicParts {
  readonly config: ServerConfig;
  readonly cloudSignInRoutes: CloudSignInRoutes | null;
  readonly cloudSessionRoutes: CloudSessionRoutes | null;
}

/** Answers a request open to anyone; `null` answers 404. */
type PublicHandler = (request: Request, parts: PublicParts) => Promise<Response> | Response | null;

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

const runPath = `${runPathPrefix}:runId`;

/**
 * Every route of a many-user server, where every caller is an end user. It answers only through
 * this table. Every other route of an owner's server, `POST /api/login`, the agent runs and the
 * Studio page included, has no entry and answers 404: the password, the keys, the Google setup,
 * the webhooks and how the project is set up are the deployment's.
 */
export const manyUserRouteTable: readonly ManyUserRoute[] = [
  {
    method: "GET",
    path: "/api/hello",
    access: "public",
    kind: "other",
    handler: (_request, { config }) => helloResponse(config, "many"),
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
    handler: waitingHandler,
  },
  {
    method: "POST",
    path: "/api/runs",
    access: "signed-in",
    kind: "run-start",
    handler: startHandler(true),
  },
  {
    method: "GET",
    path: runPath,
    access: "signed-in",
    kind: "run-read",
    handler: summaryHandler,
  },
  {
    method: "GET",
    path: `${runPath}/events`,
    access: "signed-in",
    kind: "run-read",
    handler: eventsHandler,
  },
  {
    method: "POST",
    path: `${runPath}/events`,
    access: "signed-in",
    kind: "run-write",
    handler: sendHandler,
  },
  {
    method: "POST",
    path: `${runPath}/cancel`,
    access: "signed-in",
    kind: "run-write",
    handler: cancelHandler,
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
    const scopedRuns = manyUsers.scopedRuns(principal);
    const { runs, runStore } = scopedRuns;
    const shown = workspace === undefined ? {} : { workspace };
    return {
      principal,
      runRoutes: createRunRoutes({ runs, runStore, trust, errorLog, ...shown }),
      trustRoutes: createTrustRoutes({ trust, runs }),
      ports: {
        ...scopedRuns,
        ownership: scopedRuns.ownership ?? unrecordedOwnership(principal),
        errorLog,
      },
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
        return errorResponse(serverErrors.notFound);
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
