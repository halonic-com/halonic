import type { IncomingMessage } from "node:http";

/**
 * Whether a browser says the request comes from another site. A route that
 * takes a secret checks this on the page's own headers, before it reads the
 * body. A request with no `Sec-Fetch-Site` header is Studio's own program or
 * a script, and passes.
 */
export function isFromOtherSite(request: IncomingMessage): boolean {
  const site = request.headers["sec-fetch-site"];
  return site !== undefined && site !== "same-origin";
}
