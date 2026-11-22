/**
 * The names `wrangler dev` serves a Worker on. A request to one of them never leaves the
 * developer's computer, so it is the only one the Worker answers over plain HTTP.
 */
const loopbackNames: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * What the Worker answers a plain-HTTP request with, or `undefined` when the request may go on.
 *
 * A deployed Worker is reached across the internet, never only on a local network, so it serves
 * nothing over plain HTTP: not the sign-in, not a session cookie, not the admin routes. Cloudflare
 * hands the Worker plain-HTTP requests when the zone doesn't force HTTPS, and the request URL keeps
 * the scheme the client used.
 *
 * - `GET` and `HEAD` get a permanent redirect to the same address over HTTPS. They carry no body,
 *   so a link or a typed address still works.
 * - Every other method is refused with 403 `https_required`, without reading its body. It isn't
 *   redirected: a browser would send the same body again, and it has already crossed in clear.
 * - A loopback name (`wrangler dev`) is served as it is.
 */
export function plainHttpAnswer(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || loopbackNames.has(url.hostname)) {
    return undefined;
  }
  const headers = { "cache-control": "no-store" };
  if (request.method === "GET" || request.method === "HEAD") {
    url.protocol = "https:";
    return new Response(null, { status: 308, headers: { ...headers, location: url.href } });
  }
  return Response.json(
    { code: "https_required", message: "This server only answers over HTTPS." },
    { status: 403, headers },
  );
}
