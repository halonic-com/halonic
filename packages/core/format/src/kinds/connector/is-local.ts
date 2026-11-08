import type { Connector } from "./schema.ts";

/**
 * Whether a connector counts as local for `privacy.localOnly`: its own
 * `local` setting when it has one, otherwise true for a program on this
 * machine (stdio) and for an HTTP server on a loopback address.
 *
 * @example
 * connectorIsLocal(connector); // true for { transport: { http: { url: "http://127.0.0.1:3000" } } }
 */
export function connectorIsLocal(connector: Connector): boolean {
  if (connector.local !== undefined) {
    return connector.local;
  }
  const transport = connector.transport;
  if ("stdio" in transport) {
    return true;
  }
  if ("google" in transport) {
    return false;
  }
  const host = hostOf(transport.http.url);
  if (host === undefined) {
    return false;
  }
  return (
    host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host)
  );
}

/**
 * The host of an absolute URL, lowercased and without brackets, port or user
 * info. The core has no `URL` class (plan 4.1), so this reads it by hand.
 */
function hostOf(url: string): string | undefined {
  const afterScheme = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
  if (afterScheme === null) {
    return undefined;
  }
  const authority = afterScheme[1] ?? "";
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1).toLowerCase();
  if (hostAndPort.startsWith("[")) {
    const end = hostAndPort.indexOf("]");
    return end === -1 ? undefined : hostAndPort.slice(1, end);
  }
  const colon = hostAndPort.indexOf(":");
  return colon === -1 ? hostAndPort : hostAndPort.slice(0, colon);
}
