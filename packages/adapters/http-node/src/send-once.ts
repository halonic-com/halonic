import * as http from "node:http";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { contentCodings, decompressed } from "./decompress.ts";

/** One request, ready to send: the body is already bytes. */
export interface PreparedRequest {
  readonly method: string;
  readonly headers: Headers;
  readonly body: Uint8Array | null;
}

/** Statuses whose response never has a body. */
const noBodyStatuses = new Set([204, 205, 304]);

/**
 * Headers the transport sets itself and never takes from the caller. Node
 * sends a caller's `host` instead of the URL's and, for `https`, takes the TLS
 * server name from it, so an allowed host on a shared address could front for
 * one the sheet never named. The rest decide the framing of the connection.
 */
const transportOwnedHeaders = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "upgrade",
  "expect",
  "content-length",
];

/**
 * Sends one request to a URL over `node:http` or `node:https`, connecting
 * only to the addresses `lookup` hands out, and answers with a Web `Response` whose body
 * is decompressed. Redirects come back as they are.
 */
export function sendOnce(
  url: URL,
  request: PreparedRequest,
  lookup: LookupFunction,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const isHttps = url.protocol === "https:";
  const module = isHttps ? https : http;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const headers = Object.fromEntries(request.headers);
  for (const name of transportOwnedHeaders) {
    delete headers[name];
  }
  if (request.body !== null) {
    headers["content-length"] = String(request.body.byteLength);
  }
  return new Promise((resolve, reject) => {
    const outgoing = module.request(
      {
        protocol: url.protocol,
        hostname,
        // The certificate is always checked against the URL's host. TLS takes no
        // server name for an IP address, so none is set for one.
        ...(isHttps && isIP(hostname) === 0 ? { servername: hostname } : {}),
        port: url.port === "" ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
        lookup,
        agent: false,
        signal,
      },
      (incoming) => {
        try {
          resolve(toResponse(url, request.method, incoming));
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      },
    );
    outgoing.on("error", reject);
    outgoing.end(request.body ?? undefined);
  });
}

function toResponse(url: URL, method: string, incoming: http.IncomingMessage): Response {
  const status = incoming.statusCode ?? 0;
  const headers = new Headers();
  for (let index = 0; index + 1 < incoming.rawHeaders.length; index += 2) {
    headers.append(incoming.rawHeaders[index] ?? "", incoming.rawHeaders[index + 1] ?? "");
  }
  const hasBody = method !== "HEAD" && !noBodyStatuses.has(status);
  if (!hasBody) {
    incoming.resume();
  }
  const codings = hasBody ? contentCodings(headers.get("content-encoding")) : [];
  const body = hasBody ? decompressed(incoming, codings) : null;
  if (codings.length > 0) {
    // The bytes are decoded now, so neither header describes them any more.
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  const response = new Response(body === null ? null : (Readable.toWeb(body) as ReadableStream), {
    status,
    statusText: incoming.statusMessage ?? "",
    headers,
  });
  Object.defineProperty(response, "url", { value: url.href });
  return response;
}
