import type { Server } from "./api.ts";
import { type EngineRoutePorts, engineRoutes, findEngineRoute } from "./engine-routes.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { type LaunchRefusal, launchRequestRefusal } from "./launch-token-check.ts";
import { readBody, withSecurityHeaders } from "./security.ts";

/** What the engine role's server needs from the engine. */
export type EngineServerPorts = EngineRoutePorts;

/** Everything {@link createEngineServer} needs. */
export interface EngineServerOptions {
  /** This launch's token: 32 random bytes as base64url, which only the shell knows. */
  readonly launchToken: string;
  /**
   * The loopback port the engine listens on, which the `Host` header must
   * name. A function, because the port is known only once the listener is up.
   */
  readonly port: () => number;
  /** The most bytes a request body may have. */
  readonly maxBodyBytes: number;
  readonly ports: EngineServerPorts;
}

/** A launch token as `randomLaunchToken` makes it: at least 32 bytes as base64url. */
const launchTokenPattern = /^[A-Za-z0-9_-]{43,}$/;

const refusalErrors = {
  wrong_host: serverErrors.hostNotAllowed,
  browser_origin: serverErrors.originNotAllowed,
  unauthenticated: serverErrors.launchTokenRequired,
} as const satisfies Record<LaunchRefusal, unknown>;

function refusalResponse(refusal: LaunchRefusal): Response {
  return refusal === "unauthenticated"
    ? errorResponse(refusalErrors[refusal], { "WWW-Authenticate": "Bearer" })
    : errorResponse(refusalErrors[refusal]);
}

/**
 * The server of the engine role (B1, design note D3): only the shell that
 * launched the engine may call it. Every request passes the launch checks
 * first, before its path is looked at, so a caller without the token gets 401
 * whatever the path and can't map the routes: `Host` must be
 * `127.0.0.1:<port>` or `localhost:<port>` (421), any `Origin` is refused
 * (403), and the `Authorization` header must carry the launch token (401).
 * There is no sign-in, no password and no token-free route. It serves only
 * the run routes and the two routine routes ({@link engineRoutes}); `serve`'s
 * `createServer` is a different server.
 *
 * @throws RangeError when the token is shorter than a launch token, or
 *   `maxBodyBytes` isn't a whole number above zero
 */
export function createEngineServer(options: EngineServerOptions): Server {
  const { launchToken, port, maxBodyBytes, ports } = options;
  if (!launchTokenPattern.test(launchToken)) {
    throw new RangeError("launchToken must be at least 32 random bytes as base64url");
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new RangeError("maxBodyBytes must be a whole number above zero");
  }
  const routes = engineRoutes(ports);

  async function answer(request: Request): Promise<Response> {
    const headers = request.headers;
    const refusal = launchRequestRefusal(
      {
        host: headers.get("host") ?? undefined,
        origin: headers.get("origin") ?? undefined,
        authorization: headers.get("authorization") ?? undefined,
      },
      port(),
      launchToken,
    );
    if (refusal !== undefined) {
      return refusalResponse(refusal);
    }
    const match = findEngineRoute(routes, request.method, new URL(request.url).pathname);
    if (match === undefined) {
      return errorResponse(serverErrors.notFound);
    }
    const body = await readBody(request, maxBodyBytes);
    if (!body.ok) {
      return errorResponse(serverErrors.bodyTooLarge);
    }
    return match.route.handle(request, match.segments, body.bytes);
  }

  return {
    async handle(request) {
      try {
        return withSecurityHeaders(await answer(request), request);
      } catch (cause) {
        // The cause stays out of the reply: a stack or path would tell a caller about the engine.
        ports.errorLog.record(cause);
        return withSecurityHeaders(errorResponse(serverErrors.internal), request);
      }
    },
  };
}
