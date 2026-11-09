// Between a plugin's backend and an integration sheet. A backend is a sheet
// without `id`, `version` and `kit`, which the plugin's own fields give, plus
// `entry`, so the two convert both ways without losing anything.
import type { IntegrationSheet } from "../integration/schema.ts";
import { DEFAULT_BACKEND_ENTRY, type Plugin } from "./schema.ts";

/**
 * The full integration sheet of a plugin's backend: the backend's fields
 * with the plugin's `id`, `version` and `sdk` (as `kit`) put back. The
 * integration kit and the sheet's own checks take it as they take an
 * `integration.yaml`. `undefined` for a plugin without a backend.
 *
 * @example
 * backendSheet(plugin)?.tools.map((tool) => tool.name); // ["forecast", "today"]
 */
export function backendSheet(plugin: Plugin): IntegrationSheet | undefined {
  if (plugin.backend === undefined) {
    return undefined;
  }
  // `entry` says where the code is in the plugin folder; a sheet has no such field.
  const { entry: _entry, ...sheetFields } = plugin.backend;
  return { id: plugin.id, version: plugin.version, kit: plugin.sdk, ...sheetFields };
}

/**
 * An `integration.yaml` read as a plugin with only a backend (ADR section
 * 1.5). It has no name or description of its own, so the plugin is named by
 * its id and its description is empty. `entry` is where the integration's
 * code is today, which the loader knows; it defaults to the plugin default.
 *
 * @example
 * backendSheet(pluginFromIntegrationSheet(sheet)); // deep-equals sheet
 */
export function pluginFromIntegrationSheet(
  sheet: IntegrationSheet,
  entry: string = DEFAULT_BACKEND_ENTRY,
): Plugin {
  const { id, version, kit, ...backend } = sheet;
  return { id, version, sdk: kit, name: id, description: "", backend: { ...backend, entry } };
}
