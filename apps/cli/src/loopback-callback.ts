// The local server a Google sign-in comes back to: one request, on
// `127.0.0.1`, on a port the system picks (design 3.5, HAL-698). It answers
// only `GET` on the callback path and gives the query to the command, which
// hands it to the sign-in package. It never logs or prints a query: the
// query holds the authorisation code.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** The path Google sends the browser back to. */
export const callbackPath = "/google/callback";

/** What a command needs from the loopback server. */
export interface CallbackListener {
  /** The port the server listens on. */
  readonly port: number;
  /**
   * The query of the first callback whose `state` is `state`, or `undefined`
   * when `signal` ends first. Call it before the browser is sent to Google:
   * only a request that a call waits for is kept. Any other request (a
   * stray one, a probe, one with another `state`) is not the sign-in's
   * answer, is not kept and gets a neutral page.
   */
  firstCallback(signal: AbortSignal, state: string): Promise<URLSearchParams | undefined>;
  /** Stops listening. Safe to call twice. */
  close(): Promise<void>;
}

/** The page the browser shows once the callback arrived. It holds nothing from the request. */
const donePage =
  "<!doctype html><title>Halonic</title><p>You can close this tab and go back to the terminal.</p>";

/** The page for a request no sign-in waits for. It says nothing about a sign-in having worked. */
const strayPage =
  "<!doctype html><title>Halonic</title><p>This address is not waiting for a sign-in.</p>";

const pageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

/**
 * Starts listening on `127.0.0.1` and a free port.
 *
 * @throws Error when no port can be opened
 */
export async function listenForCallback(): Promise<CallbackListener> {
  const waiting: Array<{ state: string; resolve: (query: URLSearchParams) => void }> = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== callbackPath) {
      response.writeHead(404).end();
      return;
    }
    const state = url.searchParams.get("state");
    if (state === null) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end();
      return;
    }
    const matched = waiting.filter((waiter) => waiter.state === state);
    if (matched.length === 0) {
      response.writeHead(200, pageHeaders).end(strayPage);
      return;
    }
    waiting.splice(0, waiting.length, ...waiting.filter((waiter) => waiter.state !== state));
    for (const waiter of matched) {
      waiter.resolve(url.searchParams);
    }
    response.writeHead(200, pageHeaders).end(donePage);
  });
  await listening(server);
  const { port } = server.address() as AddressInfo;
  return {
    port,
    firstCallback: (signal, state) =>
      new Promise((resolve) => {
        if (signal.aborted) {
          resolve(undefined);
          return;
        }
        const waiter = { state, resolve };
        waiting.push(waiter);
        signal.addEventListener(
          "abort",
          () => {
            const at = waiting.indexOf(waiter);
            if (at >= 0) {
              waiting.splice(at, 1);
            }
            resolve(undefined);
          },
          { once: true },
        );
      }),
    close: () =>
      new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function listening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}
