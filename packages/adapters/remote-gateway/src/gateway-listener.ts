import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { gatewayMaxFrameBytes, gatewaySessionLimits, type PhoneMessaging } from "@halonicjs/ports";
import { GatewayConnection } from "./gateway-connection.ts";
import type { GatewayRateLimit } from "./messaging-dispatch.ts";
import type { GatewayPairing, GatewayPhones } from "./phone-access.ts";
import { SecureSession } from "./secure-session.ts";
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
  /** The Inbox, Messenger and team status; without it a phone's version 4 reads are `not-supported`. */
  messaging?: GatewayMessagingHost;
  /** The host's key and its paired phones. */
  phones: GatewayPhones;
  /** The host's pairing service. */
  pairing: GatewayPairing;
  /** The port to listen on; a free one by default. */
  port?: number;
  /**
   * `Host` header values besides the loopback ones, such as the name a tunnel
   * gives this computer ("host.example.ts.net"), compared in lower case.
   */
  extraHosts?: readonly string[];
  /**
   * Header names a tunnel adds only to a request that reached it from the
   * public internet, such as Tailscale's `Tailscale-Funnel-Request` when
   * someone turned Funnel on for the gateway's port. A request that carries
   * one is refused with 403, so a tunnel made public later still can't reach
   * the gateway. Compared in lower case.
   */
  publicHeaders?: readonly string[];
  /** Connections at most at once; a new one past this is refused. */
  maxConnections?: number;
  /** How often the host pings each connection. A connection that sends nothing for 2.5 times this is dropped. */
  heartbeatMs?: number;
  /** How long an open end-to-end session may stay without saying hello before it is dropped. */
  helloTimeoutMs?: number;
  /** How long a connection's handshake may take; the ADR's 10 seconds by default. Tests shorten it. */
  handshakeTimeoutMs?: number;
  /**
   * A connection's session threw, because the pairing service or the phone
   * store failed. The listener has already ended that connection; the others
   * and the host carry on.
   */
  onError(error: unknown): void;
}

/** What the host serves every phone's Inbox, Messenger and team status from. */
export interface GatewayMessagingHost {
  /** The host's allow-list view of its agent ports. */
  readonly view: PhoneMessaging;
  /** The rate of the paired phone with this key, the same one each time it connects. */
  rateLimitFor(phoneKey: Uint8Array): GatewayRateLimit;
}

/** A running gateway listener. */
export interface GatewayListener {
  readonly port: number;
  /**
   * Sends every phone past `welcome` the full session list again, for when
   * the person turned "Let phones answer risky approvals" on or off.
   */
  listAgain(): void;
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
 * 2. it carries none of `publicHeaders`, so a tunnel someone made public
 *    later still can't reach the gateway;
 * 3. it has no `Origin`: the phone's app isn't a web page, so a browser's
 *    request is refused, and there is no CORS;
 * 4. it is a WebSocket upgrade of GET {@link gatewayPath} in version 13.
 *
 * Anything else gets a short refusal that says nothing about what this is.
 * The listener starts only when the host asks; nothing starts it by default.
 */
export async function startGatewayListener(
  options: GatewayListenerOptions,
): Promise<GatewayListener> {
  const sockets = new Set<Duplex>();
  const connections = new Set<GatewayConnection>();
  const names = {
    extraHosts: (options.extraHosts ?? []).map((host) => host.toLowerCase()),
    publicHeaders: (options.publicHeaders ?? []).map((header) => header.toLowerCase()),
  };
  let port = 0;
  const server = createServer((_request, response) => {
    response.writeHead(404, { Connection: "close", "Content-Length": 0 }).end();
  });
  server.maxConnections = options.maxConnections ?? defaultMaxConnections;
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const refusal = refusalOf(request, port, names);
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
    serveSocket(socket, options, head, connections);
  });
  port = await listenOnLoopback(server, options.port ?? 0);
  return {
    port,
    listAgain: () => {
      for (const connection of connections) connection.listAgain();
    },
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
  names: { readonly extraHosts: readonly string[]; readonly publicHeaders: readonly string[] },
): Refusal | undefined {
  const allowed = [`${gatewayLoopbackHost}:${port}`, `localhost:${port}`, ...names.extraHosts];
  const host = request.headers.host?.toLowerCase();
  if (host === undefined || hostLineCount(request) > 1 || !allowed.includes(host))
    return { status: 421, reason: "Misdirected Request" };
  if (names.publicHeaders.some((header) => request.headers[header] !== undefined))
    return { status: 403, reason: "Forbidden" };
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

/** How many `Host` lines the request carries: a hop may read another one than we do. */
function hostLineCount(request: IncomingMessage): number {
  return request.rawHeaders.filter(
    (entry, index) => index % 2 === 0 && entry.toLowerCase() === "host",
  ).length;
}

/** A handshake key is 16 random bytes in base64. */
function isHandshakeKey(key: string | undefined): boolean {
  return key !== undefined && /^[A-Za-z0-9+/]{22}==$/.test(key);
}

/**
 * Runs one phone's connection on its upgraded socket, inside the end-to-end
 * session: every binary frame goes to the {@link SecureSession}, and the
 * gateway protocol runs only inside it. A text frame, a frame over one Noise
 * message or a frame that breaks the format closes the connection: there is
 * no cleartext answer to send.
 */
function serveSocket(
  socket: Duplex,
  options: GatewayListenerOptions,
  head: Buffer,
  connections: Set<GatewayConnection>,
): void {
  let connection: GatewayConnection | undefined;
  const reader = new FrameReader(gatewayMaxFrameBytes);
  let closing = false;
  const send = (opcode: number, payload: Uint8Array) => {
    if (!closing && !socket.destroyed) socket.write(encodeFrame(opcode, payload));
  };
  const session = new SecureSession({
    phones: options.phones,
    pairing: options.pairing,
    helloTimeoutMs: options.helloTimeoutMs ?? defaultHelloTimeoutMs,
    handshakeTimeoutMs: options.handshakeTimeoutMs ?? gatewaySessionLimits.handshakeTimeoutMs,
    // The session has closed its wire by then; the error only needs reporting.
    onError: (error) => options.onError(error),
    openConnection: (transport, phoneKey) => {
      const { messaging } = options;
      connection = new GatewayConnection({
        source: options.source,
        policy: options.policy,
        transport,
        ...(messaging === undefined
          ? {}
          : { messaging: { view: messaging.view, rateLimit: messaging.rateLimitFor(phoneKey) } }),
      });
      connections.add(connection);
      return connection;
    },
    wire: {
      send: (frame) => send(frameType.binary, frame),
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
  // A throw here would be uncaught in a socket handler and stop the whole host.
  const failed = (error: unknown) => {
    socket.destroy();
    options.onError(error);
  };
  const closeSession = () => {
    try {
      session.close();
    } catch (error) {
      failed(error);
    }
  };
  const receive = (bytes: Uint8Array) => {
    try {
      session.receive(bytes);
    } catch (error) {
      closeSession();
      failed(error);
    }
  };
  const onBytes = (chunk: Buffer) => {
    heardAt = Date.now();
    for (const event of reader.push(chunk)) {
      if (event.kind === "message" && event.binary) receive(event.bytes);
      else if (event.kind === "ping") send(frameType.pong, event.bytes);
      else if (event.kind !== "pong") closeSession();
    }
  };
  socket.on("data", onBytes);
  // Bytes that came in the same packet as the handshake.
  if (head.length > 0) onBytes(head);
  // An HTTP server's sockets stay half open when the peer ends its side, so end ours too.
  socket.once("end", closeSession);
  socket.once("close", () => {
    clearInterval(heartbeat);
    if (connection !== undefined) connections.delete(connection);
    closeSession();
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
