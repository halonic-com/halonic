/**
 * Thrown when a request that has to go through the proxy can't: the proxy
 * setting is unusable, the proxy refused or dropped the tunnel, or the
 * request is one a proxy can't carry safely. The message says what to do and
 * never holds the proxy's user name or password. The request never goes
 * direct instead.
 */
export class ProxyError extends Error {
  /** A stable code, so a caller can tell a proxy failure from a refused address. */
  readonly code = "proxy-failed";

  constructor(message: string) {
    super(message);
    this.name = "ProxyError";
  }
}
