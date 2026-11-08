/**
 * Where Google sends the browser back after sign-in: the local server on
 * `127.0.0.1` (design 3.5). The server that owns the route (B5) passes its
 * port and path in. The redirect is never `localhost`, which can resolve to
 * another address, and never carries a query string or fragment, which
 * Google would refuse or which could hide a second redirect.
 */
export interface LoopbackRedirect {
  /** The port the local server listens on, 1 to 65535. */
  readonly port: number;
  /** The callback path, starting with `/`, such as `/google/callback`. */
  readonly path: string;
}

/** Letters, digits and `-._~/` only: a plain path, nothing to decode or escape. */
const plainPathPattern = /^\/[A-Za-z0-9\-._~/]*$/;

/**
 * The redirect URI for Google's auth URL and token request.
 *
 * @param redirect - the local server's port and callback path
 * @returns `http://127.0.0.1:<port><path>`
 * @throws RangeError when the port isn't a whole number from 1 to 65535, or the
 *   path doesn't start with `/`, holds `//` or `..`, or has a character other
 *   than letters, digits and `-._~/` (so no query string or fragment)
 *
 * @example
 * loopbackRedirectUri({ port: 8787, path: "/google/callback" });
 * // "http://127.0.0.1:8787/google/callback"
 */
export function loopbackRedirectUri(redirect: LoopbackRedirect): string {
  const { port, path } = redirect;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`The sign-in redirect needs a port from 1 to 65535, got ${port}.`);
  }
  if (!plainPathPattern.test(path) || path.includes("//") || path.includes("..")) {
    throw new RangeError(
      `The sign-in redirect path "${path}" must start with "/" and use only letters, digits and "-._~/", with no query string or fragment.`,
    );
  }
  return `http://127.0.0.1:${port}${path}`;
}
