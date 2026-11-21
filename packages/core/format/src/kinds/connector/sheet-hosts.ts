// The hosts a plugin or a local integration may reach, as its manifest or
// sheet lists them. They aren't in the workspace's files: a plugin is
// installed in the person's profile and an integration's sheet is in its own
// folder. So the host that reads them passes them in, and
// `privacy.localOnly` counts them (requirement
// `workspace.local-only-sheet-hosts`).

import type { IntegrationHost } from "../integration/schema.ts";
import type { Plugin } from "../plugin/schema.ts";
import { connectorIsLocal } from "./is-local.ts";
import type { Connector } from "./schema.ts";

/** The hosts each sheet a runner connector can name lists, as the host read them. */
export interface SheetHosts {
  /** The hosts each installed plugin may reach, as {@link pluginHosts} gives them, by the plugin's id. */
  readonly plugins: ReadonlyMap<string, readonly IntegrationHost[]>;
  /** The `hosts` of each local integration's sheet, by its folder's name under `integrations/`. */
  readonly integrations: ReadonlyMap<string, readonly IntegrationHost[]>;
}

/**
 * Every host a plugin may reach: its backend's `hosts`, then each local
 * tool's `network` sites the list doesn't have yet (HAL-15094). A local
 * tool's program reaches its sites from this computer, so a site counts for
 * `privacy.localOnly` as a backend host does. A plugin with no backend and
 * no sites reaches nothing, so its list is empty.
 *
 * @example
 * pluginHosts(orders); // ["api.acme.example", "files.acme.example"]
 */
export function pluginHosts(plugin: Plugin): IntegrationHost[] {
  const hosts: IntegrationHost[] = [...(plugin.backend?.hosts ?? [])];
  for (const site of (plugin.localTools ?? []).flatMap((tool) => tool.network)) {
    if (!hosts.includes(site)) hosts.push(site);
  }
  return hosts;
}

/**
 * The hosts the sheet of a `plugin` or `integration` connector lists, or
 * `undefined` for another transport or when `sheets` has no such sheet.
 */
export function sheetHostsOf(
  connector: Connector,
  sheets: SheetHosts,
): readonly IntegrationHost[] | undefined {
  const { transport } = connector;
  if ("plugin" in transport) return sheets.plugins.get(transport.plugin.id);
  if ("integration" in transport) return sheets.integrations.get(transport.integration.folder);
  return undefined;
}

/**
 * Whether a connector counts as local for `privacy.localOnly`, as
 * `connectorIsLocal` says, counting the hosts its sheet lists. With
 * `sheets`, a `plugin` or `integration` connector whose sheet isn't among
 * them isn't local: nothing then says where its code may go. Without
 * `sheets`, its `local` key decides, as before.
 *
 * @example
 * connectorIsLocalWith(orders, { plugins: new Map([["acme-orders", ["api.acme.example"]]]), integrations: new Map() });
 * // false, even with local: true
 */
export function connectorIsLocalWith(connector: Connector, sheets?: SheetHosts): boolean {
  if (sheets === undefined || !runsInRunner(connector)) return connectorIsLocal(connector);
  const hosts = sheetHostsOf(connector, sheets);
  return hosts !== undefined && connectorIsLocal(connector, hosts);
}

/** Whether the connector runs a plugin's backend or a local integration, whose sheet names its hosts. */
export function runsInRunner(connector: Connector): boolean {
  return "plugin" in connector.transport || "integration" in connector.transport;
}
