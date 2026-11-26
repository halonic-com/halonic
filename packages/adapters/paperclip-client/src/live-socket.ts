import { createHash, randomBytes } from "node:crypto";
import { connect as connectPlain, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { isLoopbackHost } from "./address.ts";
import { type PaperclipAnswer, PaperclipClientError } from "./transport.ts";

/** How long the connection and the upgrade's answer may take before the attempt counts as offline. */
export const upgradeTimeoutMs = 10_000;

/** The most an upgrade's answer head may hold; a real one is a few hundred bytes. */
const maxAnswerHead = 16 * 1024;

/** The fixed text RFC 6455 (4.2.2) adds to the key before hashing it into the accept value. */
const acceptSuffix = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** A socket after a good upgrade, with the bytes that came after the answer's head. */
export interface UpgradedSocket {
  socket: Socket;
  rest: Buffer;
}

/**
 * Opens a WebSocket to `url` with our own HTTP/1.1 upgrade, sending
 * `authorization` as the one `Authorization` header and nothing in the address
 * but its path. It refuses plain `ws` to anything but this computer before it
 * connects, leaves certificate checks on, follows no redirect (it throws), and
 * accepts only a `101` with the right accept value and no extension. A `401`
 * or another refusal comes back as a failed answer with its status; no
 * connection or no answer in time is `offline`.
 */
export async function upgradeSocket(
  url: URL,
  authorization: string,
  onOpen: (upgraded: UpgradedSocket) => void,
  timeoutMs = upgradeTimeoutMs,
): Promise<PaperclipAnswer> {
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && isLoopbackHost(url.hostname))) {
    throw new PaperclipClientError(
      "Plain ws is allowed only to this computer; use wss.",
      "refused",
    );
  }
  const key = randomBytes(16).toString("base64");
  const socket = openSocket(url);
  socket.setTimeout(timeoutMs, () => socket.destroy());
  socket.on("error", () => {
    // The platform's error can name the address; the close that follows reads as offline.
  });
  socket.write(upgradeRequest(url, key, authorization));
  const answer = await readAnswerHead(socket);
  if (answer === undefined) return { kind: "failed", failure: "offline" };
  const status = statusOf(answer.head);
  if (status >= 300 && status < 400) {
    socket.destroy();
    throw new PaperclipClientError(
      "Paperclip answered the events socket with a redirect, which the client never follows.",
      "redirect",
    );
  }
  if (status !== 101) {
    socket.destroy();
    return status === 401
      ? { kind: "failed", failure: "signed-out" }
      : { kind: "failed", failure: "refused", status };
  }
  if (!isGoodUpgrade(answer.head, key)) {
    socket.destroy();
    throw new PaperclipClientError(
      "Paperclip's events socket answer isn't a WebSocket.",
      "bad-answer",
    );
  }
  socket.setTimeout(0);
  onOpen({ socket, rest: answer.rest });
  return { kind: "ok", body: undefined };
}

/** A TLS socket for `wss`, with the platform's certificate checks, or a plain one to this computer. */
function openSocket(url: URL): Socket {
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (url.protocol === "wss:") {
    // The certificate is checked against the host either way; SNI only carries a name, never an IP.
    const servername = isIP(host) === 0 ? host : undefined;
    return connectTls({
      host,
      port: Number(url.port || 443),
      ...(servername === undefined ? {} : { servername }),
    });
  }
  return connectPlain({ host, port: Number(url.port || 80) });
}

/** The upgrade request's text: the path only, no query, and the key in the one header. */
function upgradeRequest(url: URL, key: string, authorization: string): string {
  return [
    `GET ${url.pathname} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    `Authorization: ${authorization}`,
    "",
    "",
  ].join("\r\n");
}

/**
 * The answer's head (status line and headers) and the bytes after it, or
 * `undefined` when the socket closed, timed out or sent a head over the limit
 * first. It pauses the socket once the head is read, so no frame is lost
 * before the caller listens.
 */
function readAnswerHead(socket: Socket): Promise<{ head: string; rest: Buffer } | undefined> {
  return new Promise((resolve) => {
    let received = Buffer.alloc(0);
    const finish = (result: { head: string; rest: Buffer } | undefined): void => {
      socket.off("data", onData);
      socket.off("close", onClose);
      if (result === undefined) socket.destroy();
      resolve(result);
    };
    const onClose = (): void => finish(undefined);
    const onData = (chunk: Buffer): void => {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf("\r\n\r\n");
      if (end < 0) {
        if (received.length > maxAnswerHead) finish(undefined);
        return;
      }
      socket.pause();
      finish({
        head: received.subarray(0, end).toString("latin1"),
        rest: received.subarray(end + 4),
      });
    };
    socket.on("data", onData);
    socket.on("close", onClose);
  });
}

/** The status code of an answer's head, or 0 when its first line isn't an HTTP/1.1 status line. */
function statusOf(head: string): number {
  const match = /^HTTP\/1\.1 (\d{3})(?: |$)/.exec(head);
  return match === null ? 0 : Number(match[1]);
}

/** Whether a `101` head upgrades to a WebSocket for `key`, with no extension or subprotocol. */
function isGoodUpgrade(head: string, key: string): boolean {
  const headers = new Map<string, string>();
  for (const line of head.split("\r\n").slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0)
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const expected = createHash("sha1")
    .update(key + acceptSuffix)
    .digest("base64");
  return (
    headers.get("upgrade")?.toLowerCase() === "websocket" &&
    (headers.get("connection") ?? "")
      .toLowerCase()
      .split(/\s*,\s*/)
      .includes("upgrade") &&
    headers.get("sec-websocket-accept") === expected &&
    !headers.has("sec-websocket-extensions") &&
    !headers.has("sec-websocket-protocol")
  );
}
