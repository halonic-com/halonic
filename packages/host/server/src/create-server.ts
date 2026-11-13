import type { CreateServer, RequestContext, ServerConfig } from "./api.ts";
import { checkDailyRequests } from "./daily-requests.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { checkHost, checkOrigin, readBody, withSecurityHeaders } from "./security.ts";
import { createSignIn, passwordSecretName } from "./sign-in.ts";

function checkConfig(config: ServerConfig): void {
  if (config.allowedHosts.length === 0) {
    throw new RangeError("allowedHosts needs at least one name");
  }
  if (config.dailyRequests !== undefined && !isWholeNumberAboveZero(config.dailyRequests)) {
    throw new RangeError("dailyRequests must be a whole number above zero");
  }
  if (!isWholeNumberAboveZero(config.maxBodyBytes)) {
    throw new RangeError("maxBodyBytes must be a whole number above zero");
  }
}

function isWholeNumberAboveZero(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Builds the server. Every request passes the security layer first: the
 * `Host` check, the `Origin` check, the daily request ceiling, then the body
 * limit. Then `GET /api/hello` and the sign-in routes answer. A route behind the sign-in needs a session when a password is set.
 */
export const createServer: CreateServer = ({ config, ports }) => {
  checkConfig(config);
  const allowedHosts = config.allowedHosts.map((name) => name.toLowerCase());
  const signIn = createSignIn(ports);

  async function route(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
  ): Promise<Response> {
    const endpoint = `${request.method} ${new URL(request.url).pathname}`;
    switch (endpoint) {
      case "GET /api/hello":
        // The one route that answers without a sign-in: the Android app calls it before it opens the login.
        return Response.json({
          product: "halonic",
          version: config.version,
          minAppVersion: config.minAppVersion,
        });
      case "POST /api/login":
        return signIn.login(request, body, context);
      case "POST /api/logout":
        return signIn.logout(request, context);
      case "GET /api/session":
        return (await signIn.isSignedIn(request, context))
          ? Response.json({ signedIn: true })
          : errorResponse(serverErrors.notSignedIn);
      default:
        return errorResponse(serverErrors.notFound);
    }
  }

  async function answer(request: Request, context: RequestContext): Promise<Response> {
    const hasPassword = (await ports.secrets.get(passwordSecretName)) !== null;
    const refusal = checkHost(request, { allowedHosts, hasPassword }) ?? checkOrigin(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const overCeiling = await checkDailyRequests(config, ports);
    if (overCeiling !== null) {
      return overCeiling;
    }
    const body = await readBody(request, config.maxBodyBytes);
    if (!body.ok) {
      return errorResponse(serverErrors.bodyTooLarge);
    }
    return route(request, context, body.bytes);
  }

  return {
    async handle(request, context = {}) {
      try {
        return withSecurityHeaders(await answer(request, context), request);
      } catch (cause) {
        // The cause stays out of the reply: a stack or path would tell a caller about the host.
        ports.errorLog.record(cause);
        return withSecurityHeaders(errorResponse(serverErrors.internal), request);
      }
    },
  };
};
