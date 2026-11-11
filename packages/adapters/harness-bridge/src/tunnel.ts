import { type IncomingMessage, type Server, STATUS_CODES } from "node:http";
import type { Duplex } from "node:stream";
import { type BridgeRefusal, errorBody } from "./bridge-error.ts";
import { connectRefusalOf } from "./request-checks.ts";

/**
 * Opens tunnels into `server` for a socket bridge. srt's proxy may send a
 * program's request to the socket as a `CONNECT bridge.halonic.invalid:80`
 * and then pass the bytes through. The bridge answers `200` and hands the
 * connection to its own HTTP server, so every request inside the tunnel gets
 * the same `Host`, `Origin` and token checks as any other. Any other target
 * gets a 421 and the connection closes.
 */
export function serveTunnels(
  server: Server,
  hosts: ReadonlySet<string>,
  tunnelTarget: string,
): void {
  server.on("connect", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Node takes its own error listener off the socket before it emits
    // `connect`. Without this one, a program that hangs up before our answer
    // is written (EPIPE, ECONNRESET) would throw an uncaught error and take the
    // whole agent host down. A connection the program dropped has nothing left
    // to answer, so closing it is all there is to do.
    socket.on("error", () => socket.destroy());
    const refusal = connectRefusalOf(request, hosts, tunnelTarget);
    if (refusal !== undefined) {
      socket.end(rawRefusal(refusal));
      return;
    }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    // Bytes the program sent right after the CONNECT belong to the first request inside.
    if (head.length > 0) socket.unshift(head);
    server.emit("connection", socket);
  });
}

/** A whole HTTP reply with the refusal, for a connection no `ServerResponse` belongs to. */
function rawRefusal({ status, kind, message }: BridgeRefusal): string {
  const body = errorBody(kind, message);
  return [
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ""}`,
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    "",
    body,
  ].join("\r\n");
}
