import type { InstalledPlugin } from "@halonicjs/studio-feature-plugins";
import type { PluginHosts } from "../studio/plugin-connector-row.ts";

/**
 * The hosts each installed plugin's backend lists, by the plugin's id, as the workspace trust
 * check shows them under a plugin connector: a host as its manifest writes it, a setting's host as
 * "the address in the setting region-url", in `halonic trust`'s words. A plugin without a backend,
 * or that can't load, has none.
 *
 * @example
 * pluginHostsOf(feed.current()).get("acme-orders"); // ["api.acme.example"]
 */
export function pluginHostsOf(plugins: readonly InstalledPlugin[]): PluginHosts {
  const hosts = new Map<string, readonly string[]>();
  for (const { plugin, manifest } of plugins) {
    const backend = manifest?.backend;
    if (backend === undefined) continue;
    hosts.set(
      plugin,
      backend.hosts.map((host) =>
        typeof host === "string" ? host : `the address in the setting ${host.fromSetting}`,
      ),
    );
  }
  return hosts;
}
