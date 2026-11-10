import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  type BridgeEvent,
  type BridgeRecorder,
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
  /**
   * How long `close()` waits for the routes still handling a request, such
   * as one recording its spend, once their requests are aborted, in
   * milliseconds.
   */
  closeTimeoutMs: number;
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
  const handlers = new Set<Promise<void>>();
  const recorder = new ClosingRecorder(run.recorder);
  const context = { run: { ...run, recorder }, settings, token, closing: closing.signal };
  const server = createServer((request, response) => {
    const handler = serve(context, request, response);
    handlers.add(handler);
    void handler.finally(() => handlers.delete(handler));
  });
  const port = await listenOnLoopback(server);

  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closed ??= (async () => {
      await Promise.all([stopServer(server, closing), settled(handlers, settings.closeTimeoutMs)]);
      await recorder.close();
    })();
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
    const onError = (cause: Error) => {
      reject(
        new KindedError("unavailable", "Halonic couldn't start the bridge on this computer.", {
          cause,
        }),
      );
    };
    server.once("error", onError);
    server.listen(0, loopbackHost, () => {
      // Listening worked, so this listener has nothing left to report.
      server.off("error", onError);
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
