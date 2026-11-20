import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";

/** Why a server that only the program that launched it may call turns a request away. */
export type LaunchRefusal = "wrong_host" | "browser_origin" | "unauthenticated";

/** The three headers {@link launchRequestRefusal} reads, as the host's HTTP layer gives them. */
export interface LaunchRequestHeaders {
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly authorization: string | undefined;
}

/**
 * True when a request's `Authorization` header is exactly `Bearer <token>`.
 * The comparison takes the same time wherever the two first differ, so a
 * program can't guess the token byte by byte. A missing header never matches.
 */
export function bearerMatches(authorization: string | undefined, token: string): boolean {
  if (authorization === undefined) return false;
  return constantTimeEqual(encodeUtf8(authorization), encodeUtf8(`Bearer ${token}`));
}

/**
 * The checks in front of a server that listens on loopback for the program
 * that launched it (the agent host, the engine), in this order:
 *
 * 1. `Host` is `127.0.0.1:<port>` or `localhost:<port>`, so a web page that
 *    points its own domain at 127.0.0.1 (DNS rebinding) gets nothing;
 * 2. there is no `Origin` header: the launching program isn't a browser, so
 *    any request a web page makes is refused, and there is no CORS;
 * 3. `Authorization` is `Bearer <token>`.
 *
 * The caller runs them before it looks at the path, so a caller without the
 * token can't learn which paths exist.
 *
 * @param token the launch's token, or `undefined` only for a route the host
 *   serves without it (the agent host's sign-in redirect). The engine role
 *   serves no such route, so it always passes its token.
 * @returns `undefined` when the request may go on
 */
export function launchRequestRefusal(
  headers: LaunchRequestHeaders,
  port: number,
  token: string | undefined,
): LaunchRefusal | undefined {
  const host = headers.host?.toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return "wrong_host";
  if (headers.origin !== undefined) return "browser_origin";
  if (token !== undefined && !bearerMatches(headers.authorization, token)) {
    return "unauthenticated";
  }
  return undefined;
}
