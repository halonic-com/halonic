import * as http from "node:http";
import * as https from "node:https";
import type { LookupFunction } from "node:net";
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
  const module = url.protocol === "https:" ? https : http;
  const headers = Object.fromEntries(request.headers);
  if (request.body !== null) {
    headers["content-length"] = String(request.body.byteLength);
  }
  return new Promise((resolve, reject) => {
    const outgoing = module.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
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
