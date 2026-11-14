import { type ServerError, serverErrors } from "./errors.ts";

/** The names a server with no password answers to, whatever port it listens on. */
const loopbackNames: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A host name or address, optionally in brackets for IPv6, then an optional port. Nothing else, so no user info, path or spaces. */
const hostHeaderPattern = /^(?<name>[a-z0-9.-]+|\[[0-9a-f:]+\])(?::(?<port>\d{1,5}))?$/;

const securityHeaders: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/**
 * Checks the `Host` header against the names the server answers to. This is
 * what stops DNS rebinding: a web page can make a browser send requests to
 * `localhost`, but it can't make the browser send a `Host` we allow.
 *
 * A server with no password answers only loopback names, whatever
 * `allowedHosts` holds. A loopback name matches on any port. Any other name
 * must be in `allowedHosts` lowercased, including its port.
 *
 * @returns `null` when the request may go on, otherwise the error to send
 */
export function checkHost(
  request: Request,
  options: { readonly allowedHosts: readonly string[]; readonly hasPassword: boolean },
): ServerError | null {
  const hostHeader = request.headers.get("host")?.toLowerCase();
  if (hostHeader === undefined) {
    return serverErrors.hostNotAllowed;
  }
  const parsed = hostHeaderPattern.exec(hostHeader);
  if (parsed?.groups === undefined) {
    return serverErrors.hostNotAllowed;
  }
  if (loopbackNames.has(parsed.groups["name"] ?? "")) {
    return null;
  }
  if (!options.hasPassword) {
    return serverErrors.hostNotAllowed;
  }
  return options.allowedHosts.includes(hostHeader) ? null : serverErrors.hostNotAllowed;
}

/** Whether the request was sent to a loopback name, so it never left the computer the server runs on. */
export function isLoopbackRequest(request: Request): boolean {
  const parsed = hostHeaderPattern.exec(request.headers.get("host")?.toLowerCase() ?? "");
  return loopbackNames.has(parsed?.groups?.["name"] ?? "");
}

/**
 * Whether the client reached the server over HTTPS: what the host vouches for
 * in `context.secure`, or else the scheme of the request URL.
 */
export function isSecureConnection(
  request: Request,
  context: { readonly secure?: boolean },
): boolean {
  return context.secure ?? new URL(request.url).protocol === "https:";
}

/**
 * Checks the `Origin` header. A browser sends one on every request a web page
 * makes to another address and on every same-origin write, so a request whose
 * `Origin` isn't exactly this server's own address comes from another page.
 * A request with no `Origin` (the Android app, `curl`) passes. `Origin: null`
 * does not: sandboxed pages and redirects send it.
 *
 * @returns `null` when the request may go on, otherwise the error to send
 */
export function checkOrigin(request: Request): ServerError | null {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return null;
  }
  const ownOrigin = `${new URL(request.url).protocol}//${request.headers.get("host")?.toLowerCase()}`;
  return origin.toLowerCase() === ownOrigin ? null : serverErrors.originNotAllowed;
}

/** The headers every response carries, so a browser never sniffs, frames, caches or leaks a reply. */
export function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** What {@link readBody} found: the bytes, or that the body went over the limit. */
export type BodyResult = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false };

/**
 * Reads the request body, at most `maxBytes` of it. A `Content-Length` over
 * the limit is refused before a byte is read. Without one (a chunked body) or
 * with a false one, the count runs while the body streams, and the read stops
 * and cancels the stream at the first byte over the limit, so a caller can't
 * fill memory.
 */
export async function readBody(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    return { ok: false };
  }
  if (request.body === null) {
    return { ok: true, bytes: new Uint8Array() };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
