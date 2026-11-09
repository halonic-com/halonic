import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  type HarnessBridgeOptions,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { sendBridgeError } from "./bridge-error.ts";
import { type BodyLimits, bodyTooLarge, readRequestBody } from "./read-body.ts";
import type { BridgeRoute } from "./route.ts";
import { randomRunToken, runTokenMatches } from "./run-token.ts";

/** Only this computer can reach the bridge: never another machine on the network. */
const loopbackHost = "127.0.0.1";

/** How one bridge is set up: its limits and the paths it serves. */
export interface BridgeSettings {
  limits: BodyLimits;
  routes: readonly BridgeRoute[];
}

/**
 * Starts one run's bridge on a free loopback port. Every request needs the
 * run's token in {@link harnessBridgeTokenHeader}; without it the answer is
 * 401, whatever the path, so a program can't even learn which paths exist.
 */
export async function openBridge(
  run: HarnessBridgeOptions,
  settings: BridgeSettings,
): Promise<OpenHarnessBridge> {
  const token = randomRunToken();
  const closing = new AbortController();
  const server = createServer((request, response) => {
    void serve({ run, settings, token, closing: closing.signal }, request, response);
  });
  const port = await listenOnLoopback(server);

  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closed ??= stopServer(server, closing);
    return closed;
  };
  const onRunAborted = () => void close();
  run.signal?.addEventListener("abort", onRunAborted, { once: true });
  closing.signal.addEventListener("abort", () =>
    run.signal?.removeEventListener("abort", onRunAborted),
  );
  if (run.signal?.aborted) await close();

  return { url: `http://${loopbackHost}:${port}`, token, close };
}

/** What {@link serve} needs of the bridge a request came to. */
interface ServeContext {
  run: HarnessBridgeOptions;
  settings: BridgeSettings;
  token: string;
  closing: AbortSignal;
}

/** Lets one request in, or answers it with the bridge's error. */
async function serve(context: ServeContext, request: IncomingMessage, response: ServerResponse) {
  const { run, settings, token, closing } = context;
  const requestEnded = new AbortController();
  response.on("close", () => requestEnded.abort());
  const signal = AbortSignal.any([closing, requestEnded.signal]);
  try {
    if (!runTokenMatches(request.headers[harnessBridgeTokenHeader], token)) {
      throw new KindedError(
        "unauthenticated",
        "The request doesn't carry this run's bridge token.",
      );
    }
    const route = findRoute(settings.routes, request);
    if (route === undefined) {
      throw new KindedError("not_found", "The Halonic bridge doesn't serve this path.");
    }
    if (Number(request.headers["content-length"] ?? 0) > settings.limits.maxBytes) {
      throw bodyTooLarge(settings.limits);
    }
    const readBody = () => readRequestBody(request, settings.limits);
    await route.handle({ run, request, response, readBody, signal });
  } catch (error) {
    if (response.headersSent) {
      // The reply has begun, so there is no way left to report the error: end it.
      response.destroy();
      return;
    }
    // The program may still be sending: close the connection once the error reply is out.
    response.shouldKeepAlive = false;
    sendBridgeError(response, error);
  }
}

/** The route for a request's method and path, ignoring its query. */
function findRoute(
  routes: readonly BridgeRoute[],
  request: IncomingMessage,
): BridgeRoute | undefined {
  const path = new URL(request.url ?? "/", `http://${loopbackHost}`).pathname;
  return routes.find((route) => route.method === request.method && route.path === path);
}

/** Listens on a free loopback port and resolves with that port. */
function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", (cause) => {
      reject(
        new KindedError("unavailable", "Halonic couldn't start the bridge on this computer.", {
          cause,
        }),
      );
    });
    server.listen(0, loopbackHost, () => {
      const address = server.address();
      // A TCP server always has an address object once it listens; a string is a pipe's path.
      if (address === null || typeof address === "string") {
        reject(new KindedError("internal", "The bridge listens without a port."));
        return;
      }
      resolve(address.port);
    });
  });
}

/** Refuses new requests, ends those in flight and their calls out, and waits until all have ended. */
function stopServer(server: Server, closing: AbortController): Promise<void> {
  return new Promise((resolve) => {
    closing.abort();
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
