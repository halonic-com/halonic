import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** Answers one request. It is the `Request → Response` handler of the sign-in flow. */
export type RequestHandler = (request: Request) => Promise<Response>;

/** A running loopback server. */
export interface LoopbackServer {
  /** The port the system picked. The server listens on `127.0.0.1` only. */
  readonly port: number;
  /** Stops listening, lets an answer in flight finish and ends the connections. Safe to call twice. */
  close(): Promise<void>;
}

const loopbackNames = ["127.0.0.1", "localhost"];
const closeGraceMs = 2000;

/**
 * Serves `handler` on `127.0.0.1` and a port the system picks. A request
 * whose `Host` is not the loopback address and this port is refused with a
 * 421 before the handler sees it, so a web page can't reach the server
 * through a name it controls (DNS rebinding). A handler that throws gives an
 * empty 500: the error can carry a code or a token, so it goes nowhere.
 *
 * @example
 * const server = await startLoopbackServer((request) => flow.handleCallback(request));
 * const started = await flow.start("work-account", server.port);
 * @throws Error when no port can be opened
 */
export async function startLoopbackServer(handler: RequestHandler): Promise<LoopbackServer> {
  const server = createServer((incoming, outgoing) => {
    const port = (server.address() as AddressInfo).port;
    void answer(incoming, outgoing, port, handler);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        // An answer in flight is written first; a connection still open after the grace is cut.
        const cut = setTimeout(() => server.closeAllConnections(), closeGraceMs);
        server.close(() => {
          clearTimeout(cut);
          resolve();
        });
        server.closeIdleConnections();
      }),
  };
}

async function answer(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  port: number,
  handler: RequestHandler,
): Promise<void> {
  // Answers are single pages, so no connection is kept: closing then never waits on an idle one.
  outgoing.setHeader("connection", "close");
  try {
    if (!isLoopbackHost(incoming.headers.host, port)) {
      outgoing.writeHead(421).end();
      return;
    }
    const response = await handler(toRequest(incoming, port));
    for (const [name, value] of response.headers) outgoing.setHeader(name, value);
    outgoing.writeHead(response.status);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // The cause is dropped on purpose: it can carry a code or a token.
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
}

function isLoopbackHost(host: string | undefined, port: number): boolean {
  return loopbackNames.some((name) => host === `${name}:${port}`);
}

/** The request as the handler sees it. Its body is never read: the flow answers a `GET` only. */
function toRequest(incoming: IncomingMessage, port: number): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  return new Request(new URL(incoming.url ?? "/", `http://127.0.0.1:${port}`), {
    method: incoming.method ?? "GET",
    headers,
  });
}
