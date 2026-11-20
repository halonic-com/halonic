import type { Connector } from "./schema.ts";

/**
 * Whether a connector counts as local for `privacy.localOnly`: its own
 * `local` setting when it has one, otherwise true for a program on this
 * machine (stdio) and for an HTTP server at `localhost` or a loopback address
 * written as numbers. Any other name counts as outside, as the transport
 * treats it (`connectorHostClass`): a name can resolve anywhere.
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
  if ("google" in transport || "integration" in transport || "plugin" in transport) {
    return false;
  }
  const host = hostOf(transport.http.url);
  if (host === undefined) {
    return false;
  }
  return host === "localhost" || host === "::1" || isLoopbackIpv4(host);
}

/**
 * Whether `host` is an IPv4 address in 127.0.0.0/8 written as four decimal
 * numbers. Other spellings count as not local, which is the safe side.
 */
function isLoopbackIpv4(host: string): boolean {
  const parts = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return parts?.slice(1).every((part) => Number(part) <= 255) ?? false;
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
