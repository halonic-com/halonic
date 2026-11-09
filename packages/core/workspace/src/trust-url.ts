import { asciiHost } from "@halonicjs/std";

/** The port each scheme uses when a URL names none. */
const defaultPorts: Readonly<Record<string, string>> = { http: "80", https: "443" };

/** A URL as the trust content holds it, or why it can't be trusted. */
export type TrustUrl = { url: string } | { refused: string };

/**
 * Writes a URL the way the trust content holds it: the scheme and host in
 * lowercase, the host in ASCII (Punycode), the scheme's default port left
 * out and an empty path written as `/`. Everything else (port, path, query
 * and fragment) stays as written, so two URLs that differ in any way that
 * could reach another server never look the same.
 *
 * A URL that parsers could read as another server, or that holds a
 * password, is refused rather than normalised, so it can never be trusted
 * (HAL-1954): a backslash before the query (`https://evil.test\@mcp.acme.test/`
 * connects to `evil.test`), user info (`https://ops:pw@mcp.acme.test/`), or
 * an `http:` or `https:` URL without `//`.
 *
 * The core has no `URL` class (plan 4.1), so the parts are read by hand.
 * Any other text that isn't an absolute URL is returned as written.
 *
 * @example
 * trustUrl("HTTPS://MCP.Acme.test:443"); // { url: "https://mcp.acme.test/" }
 * trustUrl("https://ops:pw@mcp.acme.test/"); // { refused: "the URL has user info" }
 */
export function trustUrl(url: string): TrustUrl {
  if (/^[^?#]*\\/s.test(url)) {
    return { refused: "the URL has a backslash before its query" };
  }
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/is.exec(url);
  if (match === null) {
    return /^https?:/i.test(url) ? { refused: "the URL has no // after its scheme" } : { url };
  }
  const scheme = (match[1] ?? "").toLowerCase();
  const authority = match[2] ?? "";
  const rest = match[3] ?? "";
  if (authority.includes("@")) {
    return { refused: "the URL has user info" };
  }
  const { host, port } = splitHostAndPort(authority);
  const shownPort = port === "" || port === defaultPorts[scheme] ? "" : `:${port}`;
  const path = rest === "" || rest.startsWith("?") || rest.startsWith("#") ? `/${rest}` : rest;
  return { url: `${scheme}://${host}${shownPort}${path}` };
}

/** Splits `host:port`, keeping an IPv6 address in its brackets. */
function splitHostAndPort(hostAndPort: string): { host: string; port: string } {
  if (hostAndPort.startsWith("[")) {
    const end = hostAndPort.indexOf("]");
    if (end === -1) {
      return { host: hostAndPort.toLowerCase(), port: "" };
    }
    return {
      host: hostAndPort.slice(0, end + 1).toLowerCase(),
      port: hostAndPort.slice(end + 2),
    };
  }
  const colon = hostAndPort.lastIndexOf(":");
  if (colon === -1) {
    return { host: asciiHost(hostAndPort), port: "" };
  }
  return {
    host: asciiHost(hostAndPort.slice(0, colon)),
    port: hostAndPort.slice(colon + 1),
  };
}
