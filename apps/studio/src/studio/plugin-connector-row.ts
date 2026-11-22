import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { listed } from "./listed.ts";

/** A plugin's backend hosts as the trust check shows them, by the plugin's id. */
export type PluginHosts = ReadonlyMap<string, readonly string[]>;

/**
 * A plugin connector's row names its plugin, "plugin acme-orders", with the hosts its installed
 * backend lists under it, as `halonic trust` shows them (HAL-15123). The plugin's own trust check
 * covered those hosts, so they aren't in the workspace's fingerprint.
 */
export function pluginConnectorRow(
  connector: ConnectorTrustContent,
  pluginHosts: PluginHosts | undefined,
  secretLines: TrustRowView["lines"],
): TrustRowView {
  const setting = connector.settings["id"];
  const plugin = typeof setting === "string" ? setting : "";
  const hosts = [...new Set(pluginHosts?.get(plugin) ?? [])];
  return {
    id: connector.id,
    detail: `plugin ${plugin}`,
    lines: [...(hosts.length === 0 ? [] : [["Reaches", listed(hosts)] as const]), ...secretLines],
  };
}
