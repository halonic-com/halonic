import type { IntegrationHost } from "../integration/schema.ts";
import type { Connector } from "./schema.ts";

/**
 * Whether a connector counts as local for `privacy.localOnly`: its own
 * `local` setting when it has one, otherwise true for a program on this
 * machine (stdio) and for an HTTP server on a loopback address.
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
  if ("google" in transport || "integration" in transport || "plugin" in transport) {
    return false;
  }
  const host = hostOf(transport.http.url);
  return host !== undefined && isLoopbackHost(host);
}

/**
 * The hosts of a sheet's `hosts` that are outside this computer and its
 * network: a fixed host that isn't a `*.localhost` name, and a host from a
 * setting whose class is `public`. A `loopback` or `private` setting stays
 * on this computer or the home network, as `local: true` means.
 *
 * @example
 * outsideHosts(["api.acme.example", { fromSetting: "station", class: "private" }]);
 * // ["api.acme.example"]
 */
export function outsideHosts(hosts: readonly IntegrationHost[]): IntegrationHost[] {
  return hosts.filter((host) =>
    typeof host === "string" ? !isLoopbackHost(withoutPort(host)) : host.class === "public",
  );
}

/** Whether a lowercased host without port or brackets is this computer. */
function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host)
  );
}

/** A sheet's host without its `:port`; a sheet's host is never an IPv6 address. */
function withoutPort(host: string): string {
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
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
