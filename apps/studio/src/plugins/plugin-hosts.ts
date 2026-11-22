import { pluginHosts } from "@halonicjs/format";
import type { InstalledPlugin } from "@halonicjs/studio-feature-plugins";
import type { PluginHosts } from "../studio/plugin-connector-row.ts";

/**
 * The hosts each installed plugin may reach, by the plugin's id, as the workspace trust check
 * shows them under a plugin connector. The list is the format's `pluginHosts`, its backend's hosts
 * and then its local tools' `network` sites, so it is the one `halonic trust` shows (HAL-15705): a
 * host as its manifest writes it, a setting's host as "the address in the setting region-url". A
 * plugin that can't load has none.
 *
 * @example
 * pluginHostsOf(feed.current()).get("acme-orders"); // ["api.acme.example", "files.acme.example"]
 */
export function pluginHostsOf(plugins: readonly InstalledPlugin[]): PluginHosts {
  const hosts = new Map<string, readonly string[]>();
  for (const { plugin, manifest } of plugins) {
    if (manifest === undefined) continue;
    hosts.set(
      plugin,
      pluginHosts(manifest).map((host) =>
        typeof host === "string" ? host : `the address in the setting ${host.fromSetting}`,
      ),
    );
  }
  return hosts;
}
