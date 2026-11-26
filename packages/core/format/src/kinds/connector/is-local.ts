import type { IntegrationHost } from "../integration/schema.ts";
import { isLoopback, parseUrlHost } from "../integration/url-host.ts";
import type { Connector } from "./schema.ts";

/**
 * Whether a connector counts as local for `privacy.localOnly`: its own
 * `local` setting when it has one, otherwise true for a program on this
 * machine (stdio) and for an HTTP server at `localhost`, `[::1]` or a
 * `127.0.0.0/8` address written as four decimal numbers. Any other name counts as outside, as the transport
 * treats it (`connectorHostClass`): a name can resolve anywhere.
 *
 * A plugin's backend or a local integration runs code whose sheet says
 * which hosts it may reach. Give those `hosts` for such a connector: when
 * one of them is outside this computer and its network
 * ({@link outsideHosts}), the connector isn't local, whatever its `local`
 * setting says.
 *
 * @param hosts - the `hosts` of the plugin's backend or the integration's sheet
 *
 * @example
 * connectorIsLocal(connector); // true for { transport: { http: { url: "http://127.0.0.1:3000" } } }
 * connectorIsLocal(pluginConnector, ["api.acme.example"]); // false, even with local: true
 */
export function connectorIsLocal(
  connector: Connector,
  hosts: readonly IntegrationHost[] = [],
): boolean {
  if (outsideHosts(hosts).length > 0) {
    return false;
  }
  if (connector.local !== undefined) {
    return connector.local;
  }
  const transport = connector.transport;
  if ("stdio" in transport) {
    return true;
  }
  if (
    "google" in transport ||
    "integration" in transport ||
    "plugin" in transport ||
    "paperclip" in transport
  ) {
    return false;
  }
  const hostname = loopbackCandidate(transport.http.url);
  return hostname !== undefined && isLoopback(hostname);
}

/**
 * The hosts of a sheet's `hosts` that are outside this computer and its
 * network: every fixed host, and a host from a setting whose class is
 * `public`. A fixed host is a name, and the runner sends a name only to a
 * public address, whatever the name looks like (`*.localhost` or `127.*`
 * included). Only a `loopback` or `private` setting, whose address the
 * runner checks on every request, stays on this computer or the home
 * network, as `local: true` means.
 *
 * @example
 * outsideHosts(["api.acme.example", { fromSetting: "station", class: "private" }]);
 * // ["api.acme.example"]
 */
export function outsideHosts(hosts: readonly IntegrationHost[]): IntegrationHost[] {
  return hosts.filter((host) => typeof host === "string" || host.class === "public");
}

/**
 * The host of an absolute `http` or `https` URL, as `URL` reads it, or
 * undefined when it isn't plainly written. As for `URL`, the host part ends at
 * the first `/`, `\`, `?` or `#`, and the user info before its last `@` is
 * dropped. The host itself must pass the strict reading of `parseUrlHost`
 * (lower-case name, dotted IPv4, `URL`'s own IPv6 form), so a host `URL`
 * would read differently is never taken for this computer. The core has no
 * `URL` class (plan 4.1).
 */
function loopbackCandidate(url: string): string | undefined {
  const parts = /^(https?):\/\/([^/\\?#]*)/i.exec(url);
  if (parts === null) {
    return undefined;
  }
  const authority = parts[2] ?? "";
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  return parseUrlHost(`${parts[1]}://${hostAndPort}`)?.hostname;
}
