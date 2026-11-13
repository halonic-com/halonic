import type { HttpClient } from "@halonicjs/ports";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * A client that follows redirects the way `fetch` does, with the same
 * answer to `redirect`: `"error"` throws when the server redirects,
 * `"manual"` hands the redirect back, and anything else follows it, with the
 * same method and body for a 307 or 308. It stands for a real client that
 * would send a code and a client secret to wherever a token endpoint points.
 *
 * @param http - the client that does the sending, which never follows
 * @returns a client that follows
 */
export function followingRedirects(http: HttpClient, maxHops = 5): HttpClient {
  return {
    async fetch(url, init = {}) {
      let target = url;
      for (let hop = 0; ; hop++) {
        const response = await http.fetch(target, init);
        const location = response.headers.get("location");
        if (
          !redirectStatuses.has(response.status) ||
          location === null ||
          init.redirect === "manual"
        ) {
          return response;
        }
        if (init.redirect === "error") {
          throw new TypeError("The server redirected, and the request doesn't allow redirects.");
        }
        if (hop >= maxHops) {
          throw new TypeError("Too many redirects.");
        }
        target = new URL(location, target).href;
      }
    },
  };
}
