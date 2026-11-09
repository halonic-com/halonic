import { asciiHost } from "@halonicjs/std";

/** The port each scheme uses when a URL names none. */
const defaultPorts: Readonly<Record<string, string>> = { http: "80", https: "443" };

/**
 * Writes a URL the way the trust content holds it: the scheme and host in
 * lowercase, the host in ASCII (Punycode), the scheme's default port left
 * out and an empty path written as `/`. Everything else (user info, port,
 * path, query and fragment) stays as written, so two URLs that differ in
 * any way that could reach another server never look the same.
 *
 * The core has no `URL` class (plan 4.1), so the parts are read by hand. A
 * text that isn't an absolute URL is returned as written.
 *
 * @example
 * trustUrl("HTTPS://MCP.Acme.test:443"); // "https://mcp.acme.test/"
 */
export function trustUrl(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/is.exec(url);
  if (match === null) {
    return url;
  }
  const scheme = (match[1] ?? "").toLowerCase();
  const authority = match[2] ?? "";
  const rest = match[3] ?? "";
  const at = authority.lastIndexOf("@");
  const userInfo = authority.slice(0, at + 1);
  const { host, port } = splitHostAndPort(authority.slice(at + 1));
  const shownPort = port === "" || port === defaultPorts[scheme] ? "" : `:${port}`;
  const path = rest === "" || rest.startsWith("?") || rest.startsWith("#") ? `/${rest}` : rest;
  return `${scheme}://${userInfo}${host}${shownPort}${path}`;
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
