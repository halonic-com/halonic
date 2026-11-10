import { classifyAddress, parseIpAddress } from "@halonicjs/adapter-http-kit";

/**
 * Addresses on the user's own machine or network, for the plain `http` hosts
 * a user may choose in a setting. Only literal addresses and
 * `localhost` count: a name can resolve anywhere. Takes `URL.hostname`, which
 * has already normalised the address. The classes come from `http-kit`, so
 * this check and the Node transport's address check can't disagree.
 */

/** `localhost`, `127.0.0.0/8` or `::1`: the user's own machine. */
export function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || literalClass(host) === "loopback";
}

/**
 * Loopback, or a private network address (`10/8`, `172.16/12`,
 * `192.168/16`, IPv6 `fc00::/7`). Link-local and metadata addresses don't
 * count: `169.254.169.254` is where cloud machines serve their credentials.
 */
export function isLocalAddress(hostname: string): boolean {
  return isLoopback(hostname) || literalClass(hostname.toLowerCase()) === "private";
}

/** The class of an IP address literal; undefined for a name. */
function literalClass(host: string): string | undefined {
  return parseIpAddress(host) === undefined ? undefined : classifyAddress(host);
}
