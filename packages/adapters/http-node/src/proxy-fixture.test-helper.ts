import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo, Socket } from "node:net";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import * as tls from "node:tls";
import type { TestCertificate } from "./test-certificate.test-helper.ts";

/** What a CONNECT proxy does with a CONNECT. */
export type ConnectAnswer = (request: IncomingMessage, client: Duplex, head: Buffer) => void;

/** One CONNECT the proxy received. */
export interface ReceivedConnect {
  /** The request line's target, such as `model.test:443`. */
  readonly target: string;
  readonly headers: IncomingMessage["headers"];
}

export interface ProxyFixture {
  readonly port: number;
  readonly connects: ReceivedConnect[];
  /** Every byte a client sent through a tunnel, as the proxy saw it (TLS ciphertext). */
  readonly tunnelled: Buffer[];
  close(): Promise<void>;
}

/** A CONNECT proxy on `127.0.0.1` that records what it receives. Close it in `afterEach`. */
export async function startProxy(answer: ConnectAnswer): Promise<ProxyFixture> {
  const connects: ReceivedConnect[] = [];
  const tunnelled: Buffer[] = [];
  const sockets = new Set<Socket>();
  const server = createHttpServer();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", (request, client, head) => {
    connects.push({ target: request.url ?? "", headers: request.headers });
    client.on("data", (chunk: Buffer) => tunnelled.push(chunk));
    answer(request, client, head);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    connects,
    tunnelled,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        // Closing a closed server is fine: a test may stop its proxy early.
        server.close(() => resolve());
      }),
  };
}

/** Answers 200 and tunnels to the loopback port the target name maps to; 502 for any other target. */
export function tunnelTo(routes: Readonly<Record<string, number>>): ConnectAnswer {
  return (request, client) => {
    const port = routes[request.url ?? ""];
    if (port === undefined) {
      client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }
    const upstream = connect(port, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
  };
}

/** A TLS origin on `127.0.0.1` that answers every request with `answer` ("hello" by default) and counts them. */
export interface TlsOrigin {
  readonly port: number;
  /** Requests that reached the application. */
  readonly requests: { url: string; headers: IncomingMessage["headers"] }[];
  /** TLS handshakes that finished. */
  handshakes(): number;
  close(): Promise<void>;
}

export async function startTlsOrigin(
  certificate: TestCertificate,
  answer: (request: IncomingMessage, response: ServerResponse) => void = (_request, response) => {
    response.end("hello");
  },
): Promise<TlsOrigin> {
  const requests: TlsOrigin["requests"] = [];
  let handshakes = 0;
  const server = createHttpsServer(
    { key: certificate.privateKey, cert: certificate.certificate },
    (request, response) => {
      requests.push({ url: request.url ?? "", headers: request.headers });
      answer(request, response);
    },
  );
  server.on("secureConnection", () => {
    handshakes++;
  });
  server.on("tlsClientError", () => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    requests,
    handshakes: () => handshakes,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Adds the certificates to the process's default CAs, and returns what puts the old ones back. */
export function trustCertificates(...certificates: TestCertificate[]): () => void {
  const before = tls.getCACertificates("default");
  tls.setDefaultCACertificates([...before, ...certificates.map((entry) => entry.certificate)]);
  return () => tls.setDefaultCACertificates(before);
}
