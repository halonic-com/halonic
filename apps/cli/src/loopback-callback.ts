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
   * The query of the first callback, or `undefined` when `signal` ends first.
   * A callback without `state` and without `error` is not a sign-in answer
   * (a stray request or a probe) and is ignored.
   */
  firstCallback(signal: AbortSignal): Promise<URLSearchParams | undefined>;
  /** Stops listening. Safe to call twice. */
  close(): Promise<void>;
}

/** The page the browser shows once the callback arrived. It holds nothing from the request. */
const donePage =
  "<!doctype html><title>Halonic</title><p>You can close this tab and go back to the terminal.</p>";

/**
 * Starts listening on `127.0.0.1` and a free port.
 *
 * @throws Error when no port can be opened
 */
export async function listenForCallback(): Promise<CallbackListener> {
  const waiting: Array<(query: URLSearchParams) => void> = [];
  let arrived: URLSearchParams | undefined;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== callbackPath) {
      response.writeHead(404).end();
      return;
    }
    const isAnswer = url.searchParams.has("state") || url.searchParams.has("error");
    if (isAnswer && arrived === undefined) {
      arrived = url.searchParams;
      for (const resolve of waiting.splice(0)) {
        resolve(url.searchParams);
      }
    }
    response
      .writeHead(isAnswer ? 200 : 400, { "content-type": "text/html; charset=utf-8" })
      .end(isAnswer ? donePage : "");
  });
  await listening(server);
  const { port } = server.address() as AddressInfo;
  return {
    port,
    firstCallback: (signal) =>
      new Promise((resolve) => {
        if (arrived !== undefined) {
          resolve(arrived);
          return;
        }
        if (signal.aborted) {
          resolve(undefined);
          return;
        }
        waiting.push(resolve);
        signal.addEventListener("abort", () => resolve(undefined), { once: true });
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
