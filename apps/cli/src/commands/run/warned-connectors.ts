// What `halonic run`'s connector warning reads beyond the run's log
// (HAL-13670, HAL-15250, HAL-14296): the connector's file, whether it is an
// integration's, and for a plugin connector where its plugin stands on this
// computer. The plugins are read once, before the run, as the warning is
// printed while the run goes.

import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { connectorFileOf, isIntegrationConnector } from "../../connector-file.ts";
import { type AddedPlugin, type AddedPlugins, connectorPlugin } from "../../connector-plugin.ts";
import type { WarnedConnectors } from "./connector-warnings.ts";

/**
 * What the warning reads about each connector in `workspace`. The plugins
 * are listed only when a connector uses one. A plugins folder that can't be
 * listed leaves the plugin out, so the warning falls back to its plain line.
 *
 * @example
 * const connectors = await warnedConnectorsOf(workspace, plugins);
 * connectors.pluginOf?.("orders"); // { id: "acme-order", state: { state: "not_added", near: "acme-orders" } }
 */
export async function warnedConnectorsOf(
  workspace: LoadedWorkspace,
  plugins: AddedPlugins,
): Promise<WarnedConnectors> {
  const pluginIds = new Map<string, string>();
  for (const { value } of filesOf(workspace, "connector")) {
    if ("plugin" in value.transport) pluginIds.set(value.id, value.transport.plugin.id);
  }
  const added = pluginIds.size === 0 ? undefined : await addedOrUndefined(plugins);
  return {
    fileOf: (connector) => connectorFileOf(workspace, connector),
    isIntegration: (connector) => isIntegrationConnector(workspace, connector),
    pluginOf: (connector) => {
      const id = pluginIds.get(connector);
      if (id === undefined || added === undefined) return undefined;
      return { id, state: connectorPlugin(id, added) };
    },
  };
}

async function addedOrUndefined(
  plugins: AddedPlugins,
): Promise<readonly AddedPlugin[] | undefined> {
  try {
    return await plugins();
  } catch {
    return undefined;
  }
}
