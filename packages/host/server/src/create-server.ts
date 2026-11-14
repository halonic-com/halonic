import type { CreateServer, RequestContext, ServerConfig } from "./api.ts";
import { chatTurnPath, createChatTurnRoutes } from "./chat-turn-routes.ts";
import { connectorCallPath, createConnectorRoutes } from "./connector-routes.ts";
import { checkDailyRequests } from "./daily-requests.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { streamRunEvents } from "./event-stream.ts";
import {
  createGoogleRoutes,
  type GoogleRoutes,
  googlePathPrefix,
  isSecretPath,
} from "./google-routes.ts";
import { googleCallbackPath } from "./google-sign-in-routes.ts";
import { createRunRoutes, isJsonRequest, parseRunId, runPathPrefix } from "./run-routes.ts";
import {
  checkHost,
  checkOrigin,
  isLoopbackRequest,
  readBody,
  withSecurityHeaders,
} from "./security.ts";
import { createSignIn, passwordSecretName } from "./sign-in.ts";
import { createTrustRoutes } from "./trust-routes.ts";
import { createWebhookRoutes, webhookPathPrefix } from "./webhooks.ts";

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
 * limit. Then `GET /api/hello` and the sign-in routes answer. A route behind the sign-in needs a session when a password is set. A route that starts a run asks the trust gate first.
 */
export const createServer: CreateServer = ({ config, ports }) => {
  checkConfig(config);
  const allowedHosts = config.allowedHosts.map((name) => name.toLowerCase());
  const signIn = createSignIn(ports);
  const trustRoutes = createTrustRoutes(ports);
  const webhookRoutes = createWebhookRoutes(ports);
  const runRoutes = createRunRoutes(ports);
  const connectorRoutes = createConnectorRoutes(ports);
  const chatTurnRoutes = createChatTurnRoutes(ports);

  /** `/api/runs/<runId>` and `/api/runs/<runId>/<action>`: the routes of one run, behind the sign-in. */
  async function runRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    rest: string,
  ): Promise<Response> {
    const [segment, action, ...more] = rest.split("/");
    const runId = parseRunId(segment ?? "");
    if (runId === null || more.length > 0) {
      return errorResponse(serverErrors.notFound);
    }
    const endpoint = `${request.method} ${action ?? ""}`;
    if (!["GET ", "GET events", "POST events", "POST cancel"].includes(endpoint)) {
      return errorResponse(serverErrors.notFound);
    }
    if (!(await signIn.isSignedIn(request, context))) {
      return errorResponse(serverErrors.notSignedIn);
    }
    switch (endpoint) {
      case "GET ":
        return runRoutes.summary(runId);
      case "GET events":
        return streamRunEvents(ports, request, runId);
      case "POST events":
        return runRoutes.send(request, runId, body);
      default:
        return runRoutes.cancel(request, runId);
    }
  }
  const googleRoutes =
    ports.google === undefined ? null : createGoogleRoutes({ google: ports.google });

  /** Answers `serve` when the caller is signed in (or no password is set), and 401 otherwise. */
  async function whenSignedIn(
    request: Request,
    context: RequestContext,
    serve: () => Promise<Response> | Response,
  ): Promise<Response> {
    return (await signIn.isSignedIn(request, context))
      ? serve()
      : errorResponse(serverErrors.notSignedIn);
  }

  /** The Google routes: all behind the sign-in, except Google's own redirect. */
  async function googleRoute(
    routes: GoogleRoutes,
    request: Request,
    context: RequestContext,
    body: Uint8Array,
  ): Promise<Response> {
    // The redirect carries the sign-in's `state` instead of a session, and the browser it reaches may hold none.
    if (request.method === "GET" && new URL(request.url).pathname === googleCallbackPath) {
      // Google sends a Desktop-app client back to a loopback address only, so a served instance doesn't expose this route on its own name.
      return isLoopbackRequest(request)
        ? routes.callback(request)
        : errorResponse(serverErrors.notFound);
    }
    return whenSignedIn(request, context, () => routes.handle(request, body, context));
  }

  async function route(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    // A sender signs its request instead of signing in, so this route sits before the sign-in routes.
    if (request.method === "POST" && pathname.startsWith(webhookPathPrefix)) {
      return webhookRoutes.receive(request, pathname.slice(webhookPathPrefix.length), body);
    }
    if (request.method === "POST" && pathname === chatTurnPath) {
      return whenSignedIn(request, context, () => chatTurnRoutes.chatTurn(request, body));
    }
    if (request.method === "POST" && pathname === connectorCallPath) {
      return whenSignedIn(request, context, () => connectorRoutes.call(request, body));
    }
    if (pathname.startsWith(runPathPrefix)) {
      return runRoute(request, context, body, pathname.slice(runPathPrefix.length));
    }
    if (pathname.startsWith(googlePathPrefix) && googleRoutes !== null) {
      return googleRoute(googleRoutes, request, context, body);
    }
    return apiRoute(request, context, body, `${request.method} ${pathname}`);
  }

  async function startRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    isWorkflow: boolean,
  ): Promise<Response> {
    if (!(await signIn.isSignedIn(request, context))) {
      return errorResponse(serverErrors.notSignedIn);
    }
    // A cross-site form can only send a non-JSON type, so it never starts a run, even with no password.
    if (!isJsonRequest(request)) {
      return errorResponse(serverErrors.unsupportedMediaType);
    }
    return isWorkflow ? trustRoutes.startWorkflow(body) : trustRoutes.startAgent(body);
  }

  async function apiRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    endpoint: string,
  ): Promise<Response> {
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
      case "GET /api/trust":
        return (await signIn.isSignedIn(request, context))
          ? trustRoutes.show()
          : errorResponse(serverErrors.notSignedIn);
      case "POST /api/runs":
      case "POST /api/agent-runs":
        return startRoute(request, context, body, endpoint === "POST /api/runs");
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

  /** Logs method, path and status. A route that takes a secret is left out, and no query string is ever logged. */
  function logRequest(request: Request, response: Response): void {
    const { pathname } = new URL(request.url);
    if (ports.requestLog === undefined || isSecretPath(pathname)) {
      return;
    }
    ports.requestLog.record({ method: request.method, path: pathname, status: response.status });
  }

  async function respond(request: Request, context: RequestContext): Promise<Response> {
    try {
      return withSecurityHeaders(await answer(request, context), request);
    } catch (cause) {
      // The cause stays out of the reply: a stack or path would tell a caller about the host.
      ports.errorLog.record(cause);
      return withSecurityHeaders(errorResponse(serverErrors.internal), request);
    }
  }

  return {
    async handle(request, context = {}) {
      const response = await respond(request, context);
      logRequest(request, response);
      return response;
    },
  };
};
