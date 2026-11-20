// Where a plugin connector's plugin stands on this computer: not added, off,
// broken or on (HAL-14296). `tools review` and `approve` ask it before they
// say trusting the plugin covers its tools, so a plugin that was never added
// is named instead of passed over in silence.

import type { PluginEntry, PluginService } from "@halonicjs/app";
import type { PluginState } from "./messages/plugin.ts";
import { nearMatch } from "./near-match.ts";

/** A plugin in the profile's plugins folder, with whether it is on, as `plugin list` shows it. */
export interface AddedPlugin {
  /** The plugin's id: its folder's name in the plugins folder. */
  readonly id: string;
  /** `broken` for a folder that can't be read or checked. */
  readonly state: PluginState | "broken";
}

/** The plugins added on this computer, so tests can hand in their own. */
export type AddedPlugins = () => Promise<readonly AddedPlugin[]>;

/**
 * Where the plugin a connector uses stands: `not_added`, with a near id
 * when one is close, so a typo in the connector's file is named; `off`
 * until a person trusts it, or trusts it again after a change; `broken`
 * when its folder can't be read or checked; or `on`.
 */
export type ConnectorPlugin =
  | { readonly state: "on" }
  | { readonly state: "not_added"; readonly near: string | undefined }
  | { readonly state: "off"; readonly why: Exclude<PluginState, "on"> }
  | { readonly state: "broken" };

/**
 * The plugins `service` finds, each with the state `plugin list` shows.
 *
 * @throws only when the plugins folder itself can't be listed
 */
export function addedPluginsOf(service: Pick<PluginService, "load">): AddedPlugins {
  return async () => (await service.load()).map(addedPlugin);
}

/**
 * The state of the plugin `id` among `added`.
 *
 * @example
 * connectorPlugin("acme-order", [{ id: "acme-orders", state: "on" }]);
 * // { state: "not_added", near: "acme-orders" }
 */
export function connectorPlugin(id: string, added: readonly AddedPlugin[]): ConnectorPlugin {
  const found = added.find((plugin) => plugin.id === id);
  if (found === undefined) {
    return {
      state: "not_added",
      near: nearMatch(
        id,
        added.map((plugin) => plugin.id),
      ),
    };
  }
  if (found.state === "on" || found.state === "broken") return { state: found.state };
  return { state: "off", why: found.state };
}

/**
 * A plugin entry's state, as `plugin list` shows it. A trust record that
 * can't be read is `notTrusted`, as on the list: trusting again fixes it.
 */
export function pluginStateOf(entry: Exclude<PluginEntry, { status: "broken" }>): PluginState {
  if (entry.status === "trusted") return "on";
  return entry.status === "changed" ? "changed" : "notTrusted";
}

function addedPlugin(entry: PluginEntry): AddedPlugin {
  if (entry.status === "broken") return { id: entry.folder, state: "broken" };
  return { id: entry.folder, state: pluginStateOf(entry) };
}
