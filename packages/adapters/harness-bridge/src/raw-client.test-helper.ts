import { request as httpRequest } from "node:http";
import { connect, type NetConnectOpts, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";

/** One request as a proxy would send it, so a test can send any target and `Host`. */
export interface RawRequest {
  method?: string;
  /** The request target: a path, or a whole URL (absolute form). */
  target: string;
  /** The `Host` header; `undefined` sends none. */
  host?: string | undefined;
  /** The run token; `undefined` sends none. */
  token?: string | undefined;
  headers?: Record<string, string>;
  body?: string;
}

/** What came back. */
export interface RawReply {
  status: number;
  text: string;
}

/**
 * Sends one request over `connection`, a new connection to the bridge or a
 * tunnel into it, and reads the whole reply.
 */
export function sendOver(connection: Duplex, request: RawRequest): Promise<RawReply> {
  const headers: Record<string, string> = { ...request.headers };
  if (request.host !== undefined) headers["host"] = request.host;
  if (request.token !== undefined) headers[harnessBridgeTokenHeader] = request.token;
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        createConnection: () => connection as Socket,
        method: request.method ?? "POST",
        path: request.target,
        headers,
        setHost: false,
      },
      (reply) => {
        const chunks: Buffer[] = [];
        reply.on("data", (chunk: Buffer) => chunks.push(chunk));
        reply.on("end", () =>
          resolve({ status: reply.statusCode ?? 0, text: Buffer.concat(chunks).toString() }),
        );
        reply.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    outgoing.end(request.body);
  });
}

/** Sends one request on a new connection to the socket at `socketPath`. */
export function sendToSocket(socketPath: string, request: RawRequest): Promise<RawReply> {
  return sendOver(connect(socketPath), request);
}

/** A `CONNECT` the bridge answered: its status, and the open connection when it is 200. */
export interface TunnelAnswer {
  status: number;
  /** Everything the bridge sent; for a refusal, up to the connection's end. */
  text: string;
  connection: Socket;
}

/** Sends `CONNECT target` to the socket and reads the bridge's answer to it. */
export function openTunnel(
  socketPath: string,
  target: string,
  host: string = target,
): Promise<TunnelAnswer> {
  const connection = connect(socketPath);
  const received: Buffer[] = [];
  return new Promise((resolve, reject) => {
    const answered = () => {
      const text = Buffer.concat(received).toString();
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0);
      connection.off("data", onData);
      connection.off("end", answered);
      resolve({ status, text, connection });
    };
    const onData = (chunk: Buffer) => {
      received.push(chunk);
      // A 200 is complete at its blank line; a refusal ends the connection.
      const text = Buffer.concat(received).toString();
      if (text.startsWith("HTTP/1.1 200 ") && text.endsWith("\r\n\r\n")) answered();
    };
    connection.on("data", onData);
    connection.on("end", answered);
    connection.on("error", reject);
    connection.write(`CONNECT ${target} HTTP/1.1\r\nhost: ${host}\r\n\r\n`);
  });
}

/**
 * Writes `text`, which may hold several requests, in one go to a new
 * connection to `to`, a socket's path or a port, and resolves with everything the bridge sent once it closed the
 * connection.
 */
export function sendPipelined(to: string | NetConnectOpts, text: string): Promise<string> {
  const connection = connect(typeof to === "string" ? { path: to } : to);
  const received: Buffer[] = [];
  return new Promise((resolve, reject) => {
    connection.on("data", (chunk: Buffer) => received.push(chunk));
    connection.on("close", () => resolve(Buffer.concat(received).toString()));
    connection.on("error", reject);
    connection.write(text);
  });
}

/**
 * Writes `text` to a new connection to the socket at `socketPath` and hangs
 * up at once, without waiting for an answer, as a program that gives up would.
 * Resolves once the connection is closed.
 */
export function sendAndHangUp(socketPath: string, text: string): Promise<void> {
  const connection = connect(socketPath);
  return new Promise((resolve) => {
    connection.on("close", () => resolve());
    // The bridge may still be writing when the connection goes; that error is expected here.
    connection.on("error", () => undefined);
    connection.write(text, () => connection.destroy());
  });
}

/** One request as HTTP/1.1 text, for {@link sendPipelined}. */
export function requestText(request: RawRequest): string {
  const body = request.body ?? "";
  const headers: Record<string, string> = { ...request.headers };
  if (request.host !== undefined) headers["host"] = request.host;
  if (request.token !== undefined) headers[harnessBridgeTokenHeader] = request.token;
  headers["content-length"] = String(Buffer.byteLength(body));
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  return [`${request.method ?? "POST"} ${request.target} HTTP/1.1`, ...lines, "", body].join(
    "\r\n",
  );
}

/** The status codes of every reply in `text`, in order. */
export function statuses(text: string): number[] {
  return [...text.matchAll(/^HTTP\/1\.1 (\d{3})/gm)].map((match) => Number(match[1]));
}
