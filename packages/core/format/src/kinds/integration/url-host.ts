/** Reading a URL's host by hand, and the address class its text proves (HAL-15005). */

/** A URL's host as the kit matches it. */
export interface FoundHost {
  /** As the kit matches it: `URL.host`, without the scheme's default port. */
  readonly host: string;
  readonly hostname: string;
  /** Plain `http`, so only to a local address. */
  readonly plain: boolean;
  /** A host name in a `private` setting, which only the transport's check at connect keeps private. */
  readonly privateName?: boolean;
}

/**
 * The scheme, host and port of an absolute `http` or `https` URL, as
 * `URL.host` gives them. The core has no `URL` class (plan 4.1), so this
 * reads it by hand and accepts only the plain forms `URL` leaves unchanged:
 * a name or dotted IPv4 address in lower case or a bracketed IPv6 address
 * as `URL` writes it. Anything else is refused, so the kit's own match never
 * sees a host spelled two ways.
 */
export function parseUrlHost(url: string): FoundHost | undefined {
  const parts = /^(https?):\/\/([^/?#]*)(?:[/?#]|$)/i.exec(url);
  const scheme = parts?.[1]?.toLowerCase();
  const authority = parts?.[2]?.toLowerCase() ?? "";
  const hostAndPort =
    /^(\[[0-9a-f:]+\]|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::(\d{1,5}))?$/.exec(
      authority,
    );
  const hostname = hostAndPort?.[1];
  if (scheme === undefined || hostname === undefined) {
    return undefined;
  }
  if (hostname.startsWith("[") ? !canonicalIpv6(hostname) : !canonicalIpv4(hostname)) {
    return undefined;
  }
  const port = hostAndPort?.[2];
  if (port !== undefined && (Number(port) > 65535 || port !== String(Number(port)))) {
    return undefined;
  }
  const defaultPort = scheme === "https" ? "443" : "80";
  const host = port === undefined || port === defaultPort ? hostname : `${hostname}:${port}`;
  return { host, hostname, plain: scheme === "http" };
}

/**
 * `URL` reads a name whose last part is a number as an IPv4 address, so such
 * a name must be four parts of 0 to 255 without leading zeros, as `URL`
 * writes it.
 */
function canonicalIpv4(hostname: string): boolean {
  if (!/(?:^|\.)\d+$/.test(hostname)) {
    return true;
  }
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  );
}

/**
 * A bracketed IPv6 address as `URL` writes it: eight groups in lower-case hex
 * without leading zeros, the longest run of two or more zero groups (the
 * first, on a tie) written `::`, and no dotted IPv4 tail.
 */
function canonicalIpv6(bracketed: string): boolean {
  const address = bracketed.slice(1, -1);
  const halves = address.split("::");
  const groupsOf = (half: string) => (half === "" ? [] : half.split(":"));
  const head = groupsOf(halves[0] ?? "");
  const tail = groupsOf(halves[1] ?? "");
  const zeros = 8 - head.length - tail.length;
  if (halves.length > 2 || (halves.length === 2 ? zeros < 1 : zeros !== 0)) {
    return false;
  }
  if (![...head, ...tail].every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
    return false;
  }
  const groups = [...head, ...Array<string>(zeros).fill("0"), ...tail].map((group) =>
    Number.parseInt(group, 16).toString(16),
  );
  let start = -1;
  let length = 0;
  for (let i = 0; i < 8; i += 1) {
    let end = i;
    while (end < 8 && groups[end] === "0") {
      end += 1;
    }
    if (end - i >= 2 && end - i > length) {
      start = i;
      length = end - i;
    }
  }
  const written =
    start === -1
      ? groups.join(":")
      : `${groups.slice(0, start).join(":")}::${groups.slice(start + length).join(":")}`;
  return written === address;
}

// The same rules as the kit's `local-address.ts`, which checks again on every
// request: only literal addresses and `localhost` count, since a name can
// resolve anywhere. Link-local addresses (169.254/16) don't count.

/** `localhost`, `127.0.0.0/8` or `::1`: this machine. */
export function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || ipv4(hostname)?.[0] === 127;
}

/** Loopback, or `10/8`, `172.16/12`, `192.168/16`, `100.64/10` or IPv6 `fc00::/7`. */
export function isLocalAddress(hostname: string): boolean {
  if (isLoopback(hostname)) {
    return true;
  }
  const v4 = ipv4(hostname);
  if (v4 !== undefined) {
    const [a = 0, b = 0] = v4;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      isSharedAddress(v4)
    );
  }
  return /^\[f[cd][0-9a-f]{2}:/.test(hostname);
}

/**
 * `100.64/10`, the shared range Tailscale's addresses sit in, apart from the
 * two service addresses in it: Tailscale's own `100.100.100.100` and
 * Alibaba's metadata service `100.100.100.200`.
 */
function isSharedAddress(v4: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0, d = 0] = v4;
  const service = a === 100 && b === 100 && c === 100 && (d === 100 || d === 200);
  return a === 100 && b >= 64 && b <= 127 && !service;
}

/** The four numbers of a whole dotted IPv4 address, as the kit reads it. */
export function ipv4(hostname: string): readonly number[] | undefined {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  return parts?.slice(1).map(Number);
}
