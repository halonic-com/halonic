import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { demuxFrames, type FrameStreams } from "../stdio/frame-demuxer.ts";
import { bearerMatches } from "./launch-token.ts";

/** Only this computer can reach the host: never another machine on the network. */
const loopbackHost = "127.0.0.1";

/** One path the host serves. */
export interface HostRoute {
  method: "GET" | "POST";
  /** The path without a query, such as "/v1/health". */
  path: string;
  handle(request: IncomingMessage, response: ServerResponse): void | Promise<void>;
}

/** The host's server, listening on a free loopback port. */
export interface HostServer {
  /** Such as "http://127.0.0.1:49152". */
  url: string;
  /** Stops listening and ends every open connection, streams included. */
  close(): Promise<void>;
}

/**
 * How long a caller may take to send a request, and how many connections may
 * be open at once. Another program on this computer can reach the port even
 * without the token, so Node's defaults (60 s for the headers, 300 s for the
 * whole request, no cap on connections) would let it hold many idle
 * connections open. The limits are on receiving a request only: a streamed
 * answer, such as a sandbox session's blocked accesses, stays open.
 */
export interface HostServerLimits {
  /** Time to receive a request's headers. */
  headersTimeoutMs: number;
  /** Time to receive a whole request, body included. At least `headersTimeoutMs`. */
  requestTimeoutMs: number;
  /** How often Node checks open connections against the two times above. */
  checkEveryMs: number;
  /** Open connections at most; a new one past this is dropped. */
  maxConnections: number;
}

export const defaultHostServerLimits: HostServerLimits = {
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
  checkEveryMs: 1_000,
  maxConnections: 256,
};

/** Why the host turned a request away, as the error's `kind` in the answer. */
type Refusal = "wrong_host" | "browser_origin" | "unauthenticated" | "not_found";

const refusalStatus: Record<Refusal, number> = {
  wrong_host: 421,
  browser_origin: 403,
  unauthenticated: 401,
  not_found: 404,
};

const refusalMessage: Record<Refusal, string> = {
  wrong_host: "The agent host answers only requests addressed to its loopback address.",
  browser_origin: "The agent host doesn't answer requests from web pages.",
  unauthenticated: "The request doesn't carry this launch's token.",
  not_found: "The agent host doesn't serve this path.",
};

/**
 * Starts the host's server on a free port of 127.0.0.1. A request gets in
 * only when it passes three checks, in this order:
 *
 * 1. its `Host` header names this loopback address and port, so a web page
 *    that points its own domain at 127.0.0.1 (DNS rebinding) gets nothing;
 * 2. it has no `Origin` header: the program that started the host isn't a
 *    browser, so a request from a web page is refused, and there is no CORS;
 * 3. its `Authorization` header is `Bearer <token>`.
 *
 * Without all three the answer is an error, whatever the path, so a caller
 * can't even learn which paths exist. A caller that is slow to send its
 * request, or holds too many connections, is cut off by `limits`.
 */
export async function startHostServer(
  token: string,
  routes: readonly HostRoute[],
  limits: HostServerLimits = defaultHostServerLimits,
): Promise<HostServer> {
  let port = 0;
  const server = createHostServer(token, routes, limits, () => port);
  server.maxConnections = limits.maxConnections;
  port = await listenOnLoopback(server);
  return { url: `http://${loopbackHost}:${port}`, close: () => stopServer(server) };
}

/** The host's server in `--stdio` mode: it has no port, and its connections arrive as frames. */
export interface FramedHostServer {
  /**
   * Settles when the frame stream ends: with `undefined` when the input
   * ended, or the error that ended it. The host stops then, as it does when
   * its input closes in the other mode.
   */
  ended: Promise<Error | undefined>;
  /** Ends every open connection, streams included. */
  close(): Promise<void>;
}

/**
 * Serves the same routes, with the same checks and limits, as
 * {@link startHostServer}, but over a frame stream instead of a port
 * (see `demuxFrames`). Studio's relay listens on Windows' loopback for the
 * host, so the `Host` header must name the relay's port: `relayPort`.
 */
export function serveHostOverFrames(
  token: string,
  routes: readonly HostRoute[],
  streams: FrameStreams,
  relayPort: number,
  limits: HostServerLimits = defaultHostServerLimits,
): FramedHostServer {
  const server = createHostServer(token, routes, limits, () => relayPort);
  // Node starts checking the time limits, and keeps the list `closeAllConnections`
  // ends, when the server starts listening. This one never does, so start them here.
  server.emit("listening");
  const accept = (connection: unknown) => server.emit("connection", connection);
  const ended = demuxFrames(streams, accept, limits.maxConnections);
  return { ended, close: () => stopServer(server) };
}

/**
 * The server with the checks of {@link startHostServer} in front of the
 * routes. `port` is the port the `Host` header must name.
 */
function createHostServer(
  token: string,
  routes: readonly HostRoute[],
  limits: HostServerLimits,
  port: () => number,
): Server {
  const options = {
    headersTimeout: limits.headersTimeoutMs,
    requestTimeout: limits.requestTimeoutMs,
    connectionsCheckingInterval: limits.checkEveryMs,
  };
  return createServer(options, (request, response) => {
    const refusal = refusalOf(request, port(), token);
    const route = refusal === undefined ? findRoute(routes, request) : undefined;
    if (route === undefined) {
      sendRefusal(request, response, refusal ?? "not_found");
      return;
    }
    // Calling `handle` inside `then` turns a synchronous throw into a rejection,
    // so one broken request can't end the whole host.
    Promise.resolve()
      .then(() => route.handle(request, response))
      .catch(() => {
        // A route answers its own errors; one that throws anyway ends its answer here.
        if (!response.headersSent) sendJson(response, 500, { error: { kind: "internal" } });
        else response.destroy();
      });
  });
}

/** Why a request may not reach any route, or `undefined` when it may. */
function refusalOf(request: IncomingMessage, port: number, token: string): Refusal | undefined {
  const host = request.headers.host?.toLowerCase();
  if (host !== `${loopbackHost}:${port}` && host !== `localhost:${port}`) return "wrong_host";
  if (request.headers.origin !== undefined) return "browser_origin";
  if (!bearerMatches(request.headers.authorization, token)) return "unauthenticated";
  return undefined;
}

function findRoute(routes: readonly HostRoute[], request: IncomingMessage): HostRoute | undefined {
  const path = (request.url ?? "").split("?")[0];
  return routes.find((route) => route.method === request.method && route.path === path);
}

function sendRefusal(request: IncomingMessage, response: ServerResponse, refusal: Refusal): void {
  if (refusal === "unauthenticated") response.setHeader("WWW-Authenticate", "Bearer");
  // The caller may still be sending a body the host won't read.
  sendErrorAndHangUp(request, response, refusalStatus[refusal], refusal, refusalMessage[refusal]);
}

/** Answers with `value` as JSON. */
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, jsonHeaders(body));
  response.end(body);
}

/** Answers with an error in the host's one shape: `{ error: { kind, message } }`. */
export function sendError(
  response: ServerResponse,
  status: number,
  kind: string,
  message: string,
): void {
  sendJson(response, status, { error: { kind, message } });
}

/**
 * How long the host goes on reading a body it won't use before it hangs up.
 * Closing a connection that still has unread data resets it, and on Windows
 * the reset makes the caller drop the answer it hasn't read yet. So the host
 * reads and throws away the rest of the body until it ends, until the caller
 * sends nothing for `idleMs`, or for `atMostMs` in all, whichever is first.
 */
const unreadBodyLinger = { idleMs: 1_000, atMostMs: 10_000 };

/**
 * Answers with an error and closes the connection, for a request whose body
 * the host won't read, or stopped reading. The whole answer goes out at once,
 * with `Connection: close`; the connection closes only once the caller has
 * stopped sending (see {@link unreadBodyLinger}), so every caller reads the
 * answer instead of a reset.
 */
export function sendErrorAndHangUp(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  kind: string,
  message: string,
): void {
  const body = JSON.stringify({ error: { kind, message } });
  response.shouldKeepAlive = false;
  response.writeHead(status, jsonHeaders(body));
  response.write(body);
  discardRestOfBody(request).then(() => {
    if (!response.destroyed) response.end();
  });
}

/** Reads and throws away the rest of the request's body, within {@link unreadBodyLinger}. */
function discardRestOfBody(request: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    if (request.complete || request.destroyed) {
      resolve();
      return;
    }
    const idle = setTimeout(stop, unreadBodyLinger.idleMs);
    const atMost = setTimeout(stop, unreadBodyLinger.atMostMs);
    const onData = () => idle.refresh();
    function stop(): void {
      clearTimeout(idle);
      clearTimeout(atMost);
      request.off("data", onData).off("end", stop).off("close", stop);
      resolve();
    }
    request.on("data", onData).once("end", stop).once("close", stop);
    request.resume();
  });
}

function jsonHeaders(body: string): Record<string, string | number> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  };
}

function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopbackHost, () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The agent host's server has no port."));
        return;
      }
      resolve(address.port);
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // A server that never listened reports "not running" here; it is stopped all the same.
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
