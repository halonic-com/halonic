// The engine role's Node listener (B1, design note D3): it puts the engine
// server of `host/server`, which checks `Host`, `Origin` and the launch
// token before any route, on a free port of 127.0.0.1. It is the agent
// host's own kind of listener: the same request timeouts and connection cap
// (`defaultHostServerLimits`), and on top a cap on the open
// `GET /api/run-updates` streams, which are the only answers that stay open.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Server } from "@halonicjs/host-server";
import {
  defaultHostServerLimits,
  type HostServerLimits,
  listenOnLoopback,
  stopServer,
} from "../server/host-server.ts";
import { OpenLimit } from "../server/open-limit.ts";

/**
 * The most `GET /api/run-updates` streams open at once. The shell opens one
 * per window, and a person has a few windows on one workspace; each stream
 * holds a connection and a listener on the run feed for as long as it
 * lasts, so a caller that keeps opening them could otherwise hold every one
 * of the listener's connections.
 */
export const maxRunUpdateStreams = 8;

const runUpdatesPath = "/api/run-updates";

/** The engine's listener on loopback. */
export interface EngineListener {
  /** Such as "http://127.0.0.1:49152". */
  readonly url: string;
  /** Stops listening and ends every open connection, streams included. */
  close(): Promise<void>;
}

/** What {@link listenForEngine} may be given besides the server. */
export interface EngineListenerOptions {
  /** Hears a request that failed after its answer started, which the caller can no longer be told. */
  reportError(error: unknown): void;
  /** The agent host's own limits by default. */
  readonly limits?: HostServerLimits;
  /** {@link maxRunUpdateStreams} by default. */
  readonly maxStreams?: number;
}

/**
 * Serves the server `serverFor` builds on a free port of 127.0.0.1. The
 * server is given the port, which the `Host` header must name, once it is
 * known. Past `maxStreams` open run-update streams, a new one is refused
 * with 503 after the server's own checks, so a caller without the token
 * still gets their refusals; an open stream is never dropped to make room.
 */
export async function listenForEngine(
  serverFor: (port: () => number) => Server,
  options: EngineListenerOptions,
): Promise<EngineListener> {
  const limits = options.limits ?? defaultHostServerLimits;
  let port = 0;
  const server = serverFor(() => port);
  const streams = new OpenLimit(options.maxStreams ?? maxRunUpdateStreams, () => 0);
  const http = createServer(
    {
      headersTimeout: limits.headersTimeoutMs,
      requestTimeout: limits.requestTimeoutMs,
      connectionsCheckingInterval: limits.checkEveryMs,
    },
    (incoming, outgoing) => {
      answer(server, streams, incoming, outgoing).catch((error: unknown) => {
        options.reportError(error);
        if (outgoing.headersSent) outgoing.destroy();
        else outgoing.writeHead(500).end();
      });
    },
  );
  http.maxConnections = limits.maxConnections;
  port = await listenOnLoopback(http);
  return { url: `http://127.0.0.1:${port}`, close: () => stopServer(http) };
}

/** Hands one Node request to the server and writes its answer back, counting run-update streams. */
async function answer(
  server: Server,
  streams: OpenLimit,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  const path = incoming.url ?? "";
  if (!path.startsWith("/")) {
    // An absolute-form target would let the caller choose the URL's own host.
    outgoing.writeHead(400).end();
    return;
  }
  // A caller that hangs up aborts the request, so a stream stops following the feed.
  const closed = new AbortController();
  outgoing.once("close", () => {
    if (!outgoing.writableFinished) closed.abort();
  });
  const response = await server.handle(webRequestOf(incoming, path, closed.signal));
  if (!isRunUpdateStream(incoming, path, response)) {
    await writeResponse(outgoing, response, closed.signal);
    return;
  }
  const release = streams.reserve();
  if (release === undefined) {
    await response.body?.cancel();
    await writeResponse(outgoing, tooManyStreams(), closed.signal);
    return;
  }
  outgoing.once("close", release);
  await writeResponse(outgoing, response, closed.signal);
}

function isRunUpdateStream(incoming: IncomingMessage, path: string, response: Response): boolean {
  return (
    incoming.method === "GET" && path.split("?")[0] === runUpdatesPath && response.status === 200
  );
}

/** The refusal of a stream past the cap, in the engine server's error shape. */
function tooManyStreams(): Response {
  return Response.json(
    {
      code: "too_many_streams",
      message: "The engine has as many run update streams open as it allows. Close one first.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function webRequestOf(incoming: IncomingMessage, path: string, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    for (const single of Array.isArray(value) ? value : [value]) {
      if (single !== undefined) headers.append(name, single);
    }
  }
  const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
  // The URL's host is a placeholder: the server checks the `Host` header, never the URL.
  return new Request(`http://127.0.0.1${path}`, {
    method: incoming.method ?? "GET",
    headers,
    signal,
    ...(hasBody ? { body: Readable.toWeb(incoming) as WebReadableStream, duplex: "half" } : {}),
  });
}

async function writeResponse(
  outgoing: ServerResponse,
  response: Response,
  closed: AbortSignal,
): Promise<void> {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body === null) {
    outgoing.end();
    return;
  }
  // Now, not with the first frame: a stream says it is open before anything happens.
  outgoing.flushHeaders();
  // `pipeline`, not `pipe`: a body that fails partway must not crash the process.
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), outgoing).catch(
    (error: unknown) => {
      // A caller that hung up ends its stream; that is no failure.
      if (!closed.aborted) throw error;
    },
  );
}
