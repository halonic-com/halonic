import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Server } from "@halonicjs/host-server";

/**
 * Hands one Node request to the Web-standard server handler and writes its
 * response back. The body goes through as a stream, so the handler's body
 * limit holds while it streams. The client address is the socket's, never a
 * header's.
 */
export async function answerRequest(
  server: Server,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  const path = incoming.url ?? "";
  if (!path.startsWith("/")) {
    // An absolute-form target would let the client choose the URL's own host.
    outgoing.writeHead(400).end();
    return;
  }
  const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
  const request = new Request(`http://localhost${path}`, {
    method: incoming.method ?? "GET",
    headers: toHeaders(incoming),
    ...(hasBody ? { body: Readable.toWeb(incoming) as WebReadableStream, duplex: "half" } : {}),
  });
  const context =
    incoming.socket.remoteAddress === undefined
      ? {}
      : { clientAddress: incoming.socket.remoteAddress };
  const response = await server.handle(request, context);
  outgoing.writeHead(response.status, toRawHeaders(response.headers));
  if (response.body === null) {
    outgoing.end();
    return;
  }
  Readable.fromWeb(response.body as WebReadableStream).pipe(outgoing);
}

function toHeaders(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    for (const single of Array.isArray(value) ? value : [value]) {
      if (single !== undefined) {
        headers.append(name, single);
      }
    }
  }
  return headers;
}

/** Response headers as Node wants them; each `Set-Cookie` stays its own header. */
function toRawHeaders(headers: Headers): Array<[string, string]> {
  const raw: Array<[string, string]> = [];
  for (const [name, value] of headers) {
    if (name !== "set-cookie") {
      raw.push([name, value]);
    }
  }
  for (const cookie of headers.getSetCookie()) {
    raw.push(["set-cookie", cookie]);
  }
  return raw;
}
