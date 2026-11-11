import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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
 * can't even learn which paths exist.
 */
export async function startHostServer(
  token: string,
  routes: readonly HostRoute[],
): Promise<HostServer> {
  let port = 0;
  const server = createServer((request, response) => {
    const refusal = refusalOf(request, port, token);
    const route = refusal === undefined ? findRoute(routes, request) : undefined;
    if (route === undefined) {
      sendRefusal(response, refusal ?? "not_found");
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
  port = await listenOnLoopback(server);
  return { url: `http://${loopbackHost}:${port}`, close: () => stopServer(server) };
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

function sendRefusal(response: ServerResponse, refusal: Refusal): void {
  if (refusal === "unauthenticated") response.setHeader("WWW-Authenticate", "Bearer");
  // The caller may still be sending: close the connection once the answer is out.
  response.shouldKeepAlive = false;
  sendJson(response, refusalStatus[refusal], {
    error: { kind: refusal, message: refusalMessage[refusal] },
  });
}

/** Answers with `value` as JSON. */
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
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
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
