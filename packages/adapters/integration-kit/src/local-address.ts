/**
 * Addresses on the user's own machine or network, for the plain `http` hosts
 * a user may choose in a setting. Only literal addresses and
 * `localhost` count: a name can resolve anywhere. Takes `URL.hostname`, which
 * has already normalised the address.
 */

/** `localhost`, `127.0.0.0/8` or `::1`: the user's own machine. */
export function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "[::1]") return true;
  return ipv4(host)?.[0] === 127;
}

/**
 * Loopback, or a private network address (`10/8`, `172.16/12`,
 * `192.168/16`, IPv6 `fc00::/7`). Link-local addresses don't count:
 * `169.254.169.254` is where cloud machines serve their credentials.
 */
export function isLocalAddress(hostname: string): boolean {
  if (isLoopback(hostname)) return true;
  const host = hostname.toLowerCase();
  const v4 = ipv4(host);
  if (v4 !== undefined) {
    const [a = 0, b = 0] = v4;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^\[f[cd][0-9a-f]{2}:/.test(host);
}

function ipv4(host: string): readonly number[] | undefined {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return parts?.slice(1).map(Number);
}
