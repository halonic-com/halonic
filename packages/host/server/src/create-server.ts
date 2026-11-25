import type {
  CreateServer,
  RequestContext,
  ServerConfig,
  ServerOptions,
  ServerPorts,
} from "./api.ts";
import { chatTurnPath, createChatTurnRoutes } from "./chat-turn-routes.ts";
import { isCloudSignInReturnPath } from "./cloud-sign-in-routes.ts";
import { connectorCallPath, createConnectorRoutes } from "./connector-routes.ts";
import { type CountRequest, checkDailyRequests } from "./daily-requests.ts";
import { createDeviceRoutes } from "./device-routes.ts";
import { createDeviceSessions } from "./device-sessions.ts";
import { withDeviceSessions } from "./device-sign-in.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import {
  createGoogleReadOnlyRoutes,
  createGoogleRoutes,
  type GoogleRoutes,
  googlePathPrefix,
  isSecretPath,
} from "./google-routes.ts";
import { googleCallbackPath } from "./google-sign-in-routes.ts";
import { helloResponse } from "./hello-route.ts";
import { isHttpsOrigin } from "./https-origin.ts";
import { createManyUserRoutes, type ManyUserRoutes } from "./many-user-routes.ts";
import {
  createModelChoiceRoutes,
  isModelChoiceKeyPath,
  modelChoicePathPrefix,
} from "./model-choice-routes.ts";
import {
  createProviderKeyRoutes,
  isProviderKeyPath,
  providerKeyPathPrefix,
} from "./provider-key-routes.ts";
import { isRoutineSchedulePath, routineScheduleRoute } from "./routine-schedule-routes.ts";
import { parseRunEndpoint, serveRunEndpoint } from "./run-endpoint.ts";
import { createRunRoutes, isJsonRequest, runPathPrefix, waitingRunsPath } from "./run-routes.ts";
import {
  checkHost,
  checkOrigin,
  isLoopbackRequest,
  readBody,
  withSecurityHeaders,
} from "./security.ts";
import { isTestOnlyVerifier } from "./session-verifier.ts";
import { createSignIn, passwordSecretName } from "./sign-in.ts";
import { createStudioPageRoutes } from "./studio-page-routes.ts";
import { createTrustRoutes } from "./trust-routes.ts";
import { createWebhookRoutes, webhookPathPrefix } from "./webhooks.ts";
import { createWorkspaceRoutes } from "./workspace-routes.ts";

function checkConfig(config: ServerConfig): void {
  if (config.allowedHosts.length === 0) {
    throw new RangeError("allowedHosts needs at least one name");
  }
  if (config.publicOrigin !== undefined && !isHttpsOrigin(config.publicOrigin)) {
    throw new RangeError("publicOrigin must be an https origin with no path");
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
 * `Host` check, the `Origin` check, then the body limit. A signed-in request or
 * a signed webhook delivery also counts against the daily request ceiling. Then `GET /api/hello` and the sign-in routes answer. A route behind the sign-in needs a session when a password is set. A route that starts a run asks the trust gate first.
 */
/** The full Google routes, or the read-only ones when the host passed only `googleRead`; `null` with neither. */
function googleRoutesOf(ports: ServerPorts): GoogleRoutes | null {
  if (ports.google !== undefined) {
    return createGoogleRoutes({ google: ports.google, clock: ports.clock });
  }
  return ports.googleRead === undefined ? null : createGoogleReadOnlyRoutes(ports.googleRead);
}

/** Whether {@link buildServer} accepts a verifier made for tests: only the package's own tests do. */
interface BuildChecks {
  readonly allowTestOnlyVerifier: boolean;
}

/** The routes of a many-user server, with only the deployment-wide ports; `null` for one owner. */
function manyUserRoutesOf(
  { config, ports, manyUsers }: ServerOptions,
  checks: BuildChecks,
): ManyUserRoutes | null {
  if (manyUsers === undefined) {
    return null;
  }
  if (isTestOnlyVerifier(manyUsers.verifier) && !checks.allowTestOnlyVerifier) {
    throw new RangeError("a many-user server can't start with a session verifier made for tests");
  }
  const { trust, errorLog, workspace, studioPage } = ports;
  const shown = { ...(workspace === undefined ? {} : { workspace }) };
  const page = { ...(studioPage === undefined ? {} : { studioPage }) };
  return createManyUserRoutes(config, { trust, errorLog, ...shown, ...page }, manyUsers);
}

export const createServer: CreateServer = (options) =>
  buildServer(options, { allowTestOnlyVerifier: false });

/** {@link createServer} for this package's tests, which may use the stub session verifier. Never exported from the package. */
export function createServerForTests(options: ServerOptions): ReturnType<CreateServer> {
  return buildServer(options, { allowTestOnlyVerifier: true });
}

function buildServer(options: ServerOptions, checks: BuildChecks): ReturnType<CreateServer> {
  const { config, ports } = options;
  checkConfig(config);
  const manyUserRoutes = manyUserRoutesOf(options, checks);
  const publicHost = config.publicOrigin === undefined ? null : new URL(config.publicOrigin).host;
  // Behind the proxy every request comes from loopback, so only the public name is allowed.
  const hostCheck = {
    allowedHosts:
      publicHost === null ? config.allowedHosts.map((name) => name.toLowerCase()) : [publicHost],
    loopbackAllowed: publicHost === null,
  };
  const devices = createDeviceSessions(ports);
  const signIn = withDeviceSessions(createSignIn(ports), devices, ports.secrets);
  const deviceRoutes = createDeviceRoutes(ports, signIn, devices);
  const trustRoutes = createTrustRoutes(ports);
  const webhookRoutes = createWebhookRoutes(ports);
  const runRoutes = createRunRoutes(ports);
  const connectorRoutes = createConnectorRoutes(ports);
  const chatTurnRoutes = createChatTurnRoutes(ports);
  const providerKeyRoutes = createProviderKeyRoutes(ports);
  const modelChoiceRoutes = createModelChoiceRoutes(ports);
  const countRequest: CountRequest = () => checkDailyRequests(config, ports);

  /** `/api/runs/<runId>` and `/api/runs/<runId>/<action>`: the routes of one run, behind the sign-in. */
  async function runRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    rest: string,
  ): Promise<Response> {
    const runEndpoint = parseRunEndpoint(request.method, rest);
    if (runEndpoint === null) {
      return errorResponse(serverErrors.notFound);
    }
    if (!(await signIn.isSignedIn(request, context))) {
      return errorResponse(serverErrors.notSignedIn);
    }
    return serveRunEndpoint(runEndpoint, request, body, { runRoutes, ports });
  }
  const workspaceRoutes =
    ports.workspace === undefined ? null : createWorkspaceRoutes(ports.workspace);
  const studioPageRoutes =
    ports.studioPage === undefined ? null : createStudioPageRoutes(ports.studioPage);
  const googleRoutes = googleRoutesOf(ports);

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

  /** The model choice routes, which work on the signed-in session's own service. */
  async function modelChoiceRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    pathname: string,
  ): Promise<Response> {
    const session = await signIn.session(request, context);
    if (session === null) {
      return errorResponse(serverErrors.notSignedIn);
    }
    const rest = pathname.slice(modelChoicePathPrefix.length);
    return modelChoiceRoutes.handle(request, context, body, rest, session);
  }

  /** The routes that need a session: a chat turn, a connector call, the provider keys, the model choice and the routines' health and pause. `null` when the address is none of them. */
  async function signedInOnlyRoute(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    pathname: string,
  ): Promise<Response | null> {
    if (request.method === "POST" && pathname === chatTurnPath) {
      return whenSignedIn(request, context, () => chatTurnRoutes.chatTurn(request, body));
    }
    if (request.method === "POST" && pathname === connectorCallPath) {
      return whenSignedIn(request, context, () => connectorRoutes.call(request, body));
    }
    if (pathname.startsWith(providerKeyPathPrefix)) {
      return whenSignedIn(request, context, () =>
        providerKeyRoutes.handle(
          request,
          context,
          body,
          pathname.slice(providerKeyPathPrefix.length),
        ),
      );
    }
    if (pathname.startsWith(modelChoicePathPrefix)) {
      return modelChoiceRoute(request, context, body, pathname);
    }
    const schedule = ports.routineSchedule;
    if (schedule === undefined || !isRoutineSchedulePath(pathname)) return null;
    return whenSignedIn(request, context, () =>
      routineScheduleRoute(schedule, request, pathname, body),
    );
  }

  /** Counts a signed-in request against the daily ceiling; one nobody signed isn't counted, so it can't use up the day. */
  async function countIfSignedIn(
    request: Request,
    context: RequestContext,
  ): Promise<Response | null> {
    return (await signIn.isSignedIn(request, context)) ? countRequest() : null;
  }

  async function route(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    // A sender signs its request instead of signing in, so this route sits before the sign-in routes.
    if (request.method === "POST" && pathname.startsWith(webhookPathPrefix)) {
      const address = pathname.slice(webhookPathPrefix.length);
      return webhookRoutes.receive(request, address, body, countRequest);
    }
    const earlyAnswer =
      (await countIfSignedIn(request, context)) ??
      (await deviceRoutes.route(request, context, body)) ??
      (await signedInOnlyRoute(request, context, body, pathname));
    if (earlyAnswer !== null) {
      return earlyAnswer;
    }
    if (request.method === "GET" && pathname === waitingRunsPath) {
      return whenSignedIn(request, context, () => runRoutes.waiting());
    }
    if (pathname.startsWith(runPathPrefix)) {
      return runRoute(request, context, body, pathname.slice(runPathPrefix.length));
    }
    if (pathname.startsWith(googlePathPrefix) && googleRoutes !== null) {
      return googleRoute(googleRoutes, request, context, body);
    }
    // After every API route, so a page file never shadows one.
    return (
      (await studioPageRoutes?.serve(request)) ??
      apiRoute(request, context, body, `${request.method} ${pathname}`)
    );
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
        return helloResponse(config);
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
      case "GET /api/workspace":
        return workspaceRoutes === null
          ? errorResponse(serverErrors.notFound)
          : whenSignedIn(request, context, () => workspaceRoutes.show());
      case "POST /api/runs":
      case "POST /api/agent-runs":
        return startRoute(request, context, body, endpoint === "POST /api/runs");
      default:
        return errorResponse(serverErrors.notFound);
    }
  }

  async function answer(request: Request, context: RequestContext): Promise<Response> {
    // A many-user server has no password, and every route but the hello needs a session, so it answers on its own names.
    const hasPassword =
      manyUserRoutes !== null || (await ports.secrets.get(passwordSecretName)) !== null;
    const refusal =
      checkHost(request, { ...hostCheck, hasPassword }) ?? checkOrigin(request, context);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const body = await readBody(request, config.maxBodyBytes);
    if (!body.ok) {
      return errorResponse(serverErrors.bodyTooLarge);
    }
    return manyUserRoutes === null
      ? route(request, context, body.bytes)
      : manyUserRoutes.route(request, body.bytes, countRequest);
  }

  /** Whether a path belongs to a route that can take a secret or a key, which the request log leaves out. */
  function takesSecret(pathname: string): boolean {
    return (
      isSecretPath(pathname) ||
      isProviderKeyPath(pathname) ||
      isModelChoiceKeyPath(pathname) ||
      isCloudSignInReturnPath(pathname)
    );
  }

  /** Logs method, path and status. A route that takes a secret is left out, and no query string is ever logged. */
  function logRequest(request: Request, response: Response): void {
    const { pathname } = new URL(request.url);
    if (ports.requestLog === undefined || takesSecret(pathname)) {
      return;
    }
    ports.requestLog.record({ method: request.method, path: pathname, status: response.status });
  }

  async function respond(request: Request, hostContext: RequestContext): Promise<Response> {
    // The operator vouches for the proxy in front of a public origin; no `X-Forwarded-*` header is read.
    const context = publicHost === null ? hostContext : { ...hostContext, secure: true };
    try {
      return withSecurityHeaders(await answer(request, context), request, context);
    } catch (cause) {
      // The cause stays out of the reply: a stack or path would tell a caller about the host.
      ports.errorLog.record(cause);
      return withSecurityHeaders(errorResponse(serverErrors.internal), request, context);
    }
  }

  return {
    async handle(request, context = {}) {
      const response = await respond(request, context);
      logRequest(request, response);
      return response;
    },
  };
}
