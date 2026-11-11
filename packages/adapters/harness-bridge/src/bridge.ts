import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import {
  type BridgeEvent,
  type BridgeRecorder,
  type HarnessBridgeOptions,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { sendBridgeError, sendBridgeRefusal } from "./bridge-error.ts";
import { type BridgePlace, listenAt } from "./listener.ts";
import { type BodyLimits, bodyTooLarge, readRequestBody } from "./read-body.ts";
import { refusalOf } from "./request-checks.ts";
import type { BridgeRoute } from "./route.ts";
import { randomRunToken, runTokenMatches } from "./run-token.ts";
import { serveTunnels } from "./tunnel.ts";

/** How one bridge is set up: its limits and the paths it serves. */
export interface BridgeSettings {
  /** Where each run's bridge listens. */
  place: BridgePlace;
  limits: BodyLimits;
  routes: readonly BridgeRoute[];
  /**
   * How long `close()` waits for the routes still handling a request, such
   * as one recording its spend, once their requests are aborted, in
   * milliseconds.
   */
  closeTimeoutMs: number;
}

/**
 * Starts one run's bridge at `settings.place`: a free loopback port, or a
 * new Unix socket that the program reaches by name through the sandbox's
 * proxy. A request gets in only when it passes three checks, in this order:
 *
 * 1. its `Host` header names this bridge (this loopback address and port, or
 *    the socket bridge's name), and so does its target when it is a whole
 *    URL, or the answer is 421;
 * 2. it has no `Origin` header, or the answer is 403;
 * 3. it carries the run's token in {@link harnessBridgeTokenHeader}, or the
 *    answer is 401.
 *
 * Each answer is the same whatever the path, so a program can't even learn
 * which paths exist. Once a request is refused or fails, nothing else on its
 * connection is served.
 */
export async function openBridge(
  run: HarnessBridgeOptions,
  settings: BridgeSettings,
): Promise<OpenHarnessBridge> {
  const token = randomRunToken();
  const closing = new AbortController();
  const handlers = new Set<Promise<void>>();
  const recorder = new ClosingRecorder(run.recorder);
  const hosts = new Set<string>();
  const context: ServeContext = {
    run: { ...run, recorder },
    settings,
    token,
    hosts,
    closing: closing.signal,
    endedConnections: new WeakSet(),
  };
  const server = createServer((request, response) => {
    const handler = serve(context, request, response);
    handlers.add(handler);
    void handler.finally(() => handlers.delete(handler));
  });
  const listening = await listenAt(server, settings.place);
  for (const host of listening.hosts) hosts.add(host);
  if (listening.tunnelTarget !== undefined) {
    serveTunnels(server, listening.hosts, listening.tunnelTarget);
  }

  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closed ??= (async () => {
      await Promise.all([stopServer(server, closing), settled(handlers, settings.closeTimeoutMs)]);
      await Promise.all([recorder.close(), listening.cleanUp()]);
    })();
    return closed;
  };
  const onRunAborted = () => void close();
  run.signal?.addEventListener("abort", onRunAborted, { once: true });
  closing.signal.addEventListener("abort", () =>
    run.signal?.removeEventListener("abort", onRunAborted),
  );
  if (run.signal?.aborted) await close();

  const { url, socketPath } = listening;
  return { url, token, ...(socketPath === undefined ? {} : { socketPath }), close };
}

/** What {@link serve} needs of the bridge a request came to. */
interface ServeContext {
  run: HarnessBridgeOptions;
  settings: BridgeSettings;
  token: string;
  /** The `Host` values that name this bridge, in lower case. */
  hosts: ReadonlySet<string>;
  closing: AbortSignal;
  /** Connections that got a refusal or an error, so nothing more on them is served. */
  endedConnections: WeakSet<Socket>;
}

/** Lets one request in, or answers it with the bridge's error. */
async function serve(context: ServeContext, request: IncomingMessage, response: ServerResponse) {
  const { run, settings, token, hosts, closing, endedConnections } = context;
  if (endedConnections.has(request.socket)) {
    // Node reads a request sent right behind a refused one before the connection closes.
    response.destroy();
    return;
  }
  const refusal = refusalOf(request, hosts);
  if (refusal !== undefined) {
    // The caller may still be sending: close the connection once the refusal is out.
    endedConnections.add(request.socket);
    response.shouldKeepAlive = false;
    sendBridgeRefusal(response, refusal);
    return;
  }
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
    // A body can be read only once, so a second call gets the same read.
    let body: Promise<Uint8Array> | undefined;
    const readBody = () => {
      body ??= readRequestBody(request, settings.limits);
      return body;
    };
    await route.handle({ run, request, response, readBody, signal });
  } catch (error) {
    if (response.headersSent) {
      // The reply has begun, so there is no way left to report the error: end it.
      response.destroy();
      return;
    }
    // The program may still be sending: close the connection once the error reply is out.
    endedConnections.add(request.socket);
    response.shouldKeepAlive = false;
    sendBridgeError(response, error);
  }
}

/** The route for a request's method and path, ignoring its query. */
function findRoute(
  routes: readonly BridgeRoute[],
  request: IncomingMessage,
): BridgeRoute | undefined {
  // The base only fills in a path-only target; an absolute one was checked already.
  const path = new URL(request.url ?? "/", "http://bridge").pathname;
  return routes.find((route) => route.method === request.method && route.path === path);
}

/** Refuses new requests, ends those in flight and their calls out, and waits until all have ended. */
function stopServer(server: Server, closing: AbortController): Promise<void> {
  return new Promise((resolve) => {
    closing.abort();
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/**
 * The run's recorder as the routes see it. Once closed it refuses new events,
 * and `close()` resolves only after the events it had already accepted have
 * landed: the engine counts the run as finished then, so nothing may land
 * after that, not even from a route still running past the close time limit.
 */
class ClosingRecorder implements BridgeRecorder {
  readonly #inner: BridgeRecorder;
  readonly #recording = new Set<Promise<void>>();
  #closed = false;

  constructor(inner: BridgeRecorder) {
    this.#inner = inner;
  }

  record(event: BridgeEvent): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        new KindedError("conflict", "The bridge has closed, so it records nothing more."),
      );
    }
    const recording = this.#inner.record(event);
    this.#recording.add(recording);
    void recording.then(
      () => this.#recording.delete(recording),
      () => this.#recording.delete(recording),
    );
    return recording;
  }

  /** Refuses new events and waits for those already accepted. */
  async close(): Promise<void> {
    this.#closed = true;
    await Promise.allSettled(this.#recording);
  }
}

/**
 * Waits until every handler still running has settled, or until `timeoutMs`
 * has passed, so a stuck handler can't hold up the end of the run.
 */
async function settled(handlers: ReadonlySet<Promise<void>>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([Promise.allSettled(handlers), timeUp]);
  } finally {
    clearTimeout(timer);
  }
}
