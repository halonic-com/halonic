import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { gatewayMaxMessageBytes } from "@halonicjs/ports";
import { GatewayConnection } from "./gateway-connection.ts";
import type { GatewayPolicy, GatewaySessionSource } from "./session-source.ts";
import { encodeFrame, FrameReader, frameType } from "./websocket-frames.ts";

/**
 * The only address the gateway listens on. A tunnel forwards to it from the
 * outside; nothing else on this computer's network can reach the port.
 */
export const gatewayLoopbackHost = "127.0.0.1";

/** The path a phone connects to. */
export const gatewayPath = "/v1/gateway";

export interface GatewayListenerOptions {
  source: GatewaySessionSource;
  policy: GatewayPolicy;
  /** The port to listen on; a free one by default. */
  port?: number;
  /**
   * `Host` header values besides the loopback ones, such as the name a tunnel
   * gives this computer ("host.example.ts.net"), compared in lower case.
   */
  extraHosts?: readonly string[];
  /** Connections at most at once; a new one past this is refused. */
  maxConnections?: number;
  /** How often the host pings each connection. A connection that sends nothing for 2.5 times this is dropped. */
  heartbeatMs?: number;
  /** How long a connection may stay without saying hello before it is dropped. */
  helloTimeoutMs?: number;
}

/** A running gateway listener. */
export interface GatewayListener {
  readonly port: number;
  /** Ends every connection and stops listening. */
  close(): Promise<void>;
}

const defaultMaxConnections = 8;
const defaultHeartbeatMs = 30_000;
const defaultHelloTimeoutMs = 10_000;
/** How long a closing connection may take to end before its socket is destroyed. */
const closeGraceMs = 2_000;
const handshakeGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Why the gateway turned a request away. */
type Refusal = { status: number; reason: string };

/**
 * Starts the remote gateway's listener on a loopback port. A request gets a
 * WebSocket only when it passes every check, in this order:
 *
 * 1. its `Host` names this listener (loopback and its port, or one of
 *    `extraHosts`), so a web page that points its own name at this computer
 *    gets nothing;
 * 2. it has no `Origin`: the phone's app isn't a web page, so a browser's
 *    request is refused, and there is no CORS;
 * 3. it is a WebSocket upgrade of GET {@link gatewayPath} in version 13.
 *
 * Anything else gets a short refusal that says nothing about what this is.
 * The listener starts only when the host asks; nothing starts it by default.
 */
export async function startGatewayListener(
  options: GatewayListenerOptions,
): Promise<GatewayListener> {
  const sockets = new Set<Duplex>();
  const extraHosts = (options.extraHosts ?? []).map((host) => host.toLowerCase());
  let port = 0;
  const server = createServer((_request, response) => {
    response.writeHead(404, { Connection: "close", "Content-Length": 0 }).end();
  });
  server.maxConnections = options.maxConnections ?? defaultMaxConnections;
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const refusal = refusalOf(request, port, extraHosts);
    if (refusal !== undefined) {
      socket.end(
        `HTTP/1.1 ${refusal.status} ${refusal.reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      return;
    }
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}${handshakeGuid}`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    serveSocket(socket, options, head);
  });
  port = await listenOnLoopback(server, options.port ?? 0);
  return {
    port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
      }),
  };
}

/** Why a request may not become a connection, or `undefined` when it may. */
function refusalOf(
  request: IncomingMessage,
  port: number,
  extraHosts: readonly string[],
): Refusal | undefined {
  const allowed = [`${gatewayLoopbackHost}:${port}`, `localhost:${port}`, ...extraHosts];
  const host = request.headers.host?.toLowerCase();
  if (host === undefined || !allowed.includes(host))
    return { status: 421, reason: "Misdirected Request" };
  if (request.headers.origin !== undefined) return { status: 403, reason: "Forbidden" };
  const isUpgrade =
    request.method === "GET" &&
    (request.url ?? "").split("?")[0] === gatewayPath &&
    request.headers.upgrade?.toLowerCase() === "websocket" &&
    request.headers.connection
      ?.toLowerCase()
      .split(",")
      .map((part) => part.trim())
      .includes("upgrade") === true &&
    request.headers["sec-websocket-version"] === "13" &&
    isHandshakeKey(request.headers["sec-websocket-key"]);
  return isUpgrade ? undefined : { status: 404, reason: "Not Found" };
}

/** A handshake key is 16 random bytes in base64. */
function isHandshakeKey(key: string | undefined): boolean {
  return key !== undefined && /^[A-Za-z0-9+/]{22}==$/.test(key);
}

/** Runs one phone's connection on its upgraded socket. */
function serveSocket(socket: Duplex, options: GatewayListenerOptions, head: Buffer): void {
  const reader = new FrameReader(gatewayMaxMessageBytes);
  let closing = false;
  const send = (opcode: number, payload: Uint8Array) => {
    if (!closing && !socket.destroyed) socket.write(encodeFrame(opcode, payload));
  };
  const connection = new GatewayConnection({
    source: options.source,
    policy: options.policy,
    transport: {
      send: (json) => send(frameType.text, Buffer.from(json, "utf8")),
      bufferedBytes: () => socket.writableLength,
      close: () => {
        send(frameType.close, Buffer.alloc(0));
        closing = true;
        socket.end();
        // A peer that never ends its side must not keep this connection's slot.
        setTimeout(() => socket.destroy(), closeGraceMs).unref();
      },
    },
  });
  const heartbeatMs = options.heartbeatMs ?? defaultHeartbeatMs;
  let heardAt = Date.now();
  const heartbeat = setInterval(() => {
    if (Date.now() - heardAt > heartbeatMs * 2.5) socket.destroy();
    else send(frameType.ping, Buffer.alloc(0));
  }, heartbeatMs);
  heartbeat.unref();
  // A phone that answers pings but never says hello would otherwise hold its slot for ever.
  const helloDeadline = setTimeout(() => {
    if (!connection.hasGreeted()) socket.destroy();
  }, options.helloTimeoutMs ?? defaultHelloTimeoutMs);
  helloDeadline.unref();
  const onBytes = (chunk: Buffer) => {
    heardAt = Date.now();
    for (const event of reader.push(chunk)) {
      switch (event.kind) {
        case "message":
          connection.receive({ binary: event.binary, bytes: event.bytes });
          break;
        case "ping":
          send(frameType.pong, event.bytes);
          break;
        case "close":
          connection.close();
          break;
        case "too-large":
          connection.receiveTooLarge();
          break;
        case "protocol-error":
          connection.close();
          break;
      }
    }
  };
  socket.on("data", onBytes);
  // Bytes that came in the same packet as the handshake.
  if (head.length > 0) onBytes(head);
  // An HTTP server's sockets stay half open when the peer ends its side, so end ours too.
  socket.once("end", () => connection.close());
  socket.once("close", () => {
    clearInterval(heartbeat);
    clearTimeout(helloDeadline);
    connection.close();
  });
  socket.on("error", () => socket.destroy());
}

function listenOnLoopback(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, gatewayLoopbackHost, () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The remote gateway's server has no port."));
        return;
      }
      resolve(address.port);
    });
  });
}
