import type { HttpClient } from "@halonicjs/ports";

/**
 * The server's `HttpClient` for sign-in requests: it sends a request only to
 * an `https` address and refuses any other, plain `http` included, before the
 * wrapped client sees it. A token request carries the code, the client secret
 * and the refresh token, which must never travel unencrypted. A refusal is an
 * error, which the token request counts as an unreachable provider.
 *
 * @param http - the transport to wrap; it still checks the addresses it connects to
 * @returns a client that passes on `https` requests only
 *
 * @example
 * const signInHttp = createHttpsOnlyClient(nodeClient);
 * await signInHttp.fetch("http://auth.example.com/token"); // throws
 */
export function createHttpsOnlyClient(http: HttpClient): HttpClient {
  return {
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      if (!isHttps(url)) {
        throw new TypeError("a sign-in request goes over https only");
      }
      return http.fetch(url, init);
    },
  };
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
