// The plugins a workspace's connectors use, checked against the ones added
// on this computer, for the Plugins line of `halonic doctor` (HAL-14296).
// The same check `halonic tools review` makes, so both say the same.

import type { DoctorPluginProblem, DoctorWorkspace } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import {
  type AddedPlugin,
  type AddedPlugins,
  type ConnectorPlugin,
  connectorPlugin,
} from "./connector-plugin.ts";

/**
 * `workspace`, with what is wrong with the plugins `connectors` use. The
 * profile's plugins are read only when a connector uses one, and not at all
 * on a computer that can't list them (`plugins` left out). When the plugins
 * folder itself can't be listed, each plugin the connectors use can't be
 * read, so the line says so and the other lines still show.
 */
export async function withPluginProblems(
  workspace: DoctorWorkspace,
  connectors: readonly Connector[],
  plugins: AddedPlugins | undefined,
): Promise<DoctorWorkspace> {
  const usePlugins = connectors.some((connector) => "plugin" in connector.transport);
  if (plugins === undefined || !usePlugins) return workspace;
  const pluginProblems = doctorPluginProblems(connectors, await addedOrUnreadable(plugins));
  return pluginProblems.length === 0 ? workspace : { ...workspace, pluginProblems };
}

/** The added plugins, or `undefined` when the plugins folder can't be listed. */
async function addedOrUnreadable(
  plugins: AddedPlugins,
): Promise<readonly AddedPlugin[] | undefined> {
  try {
    return await plugins();
  } catch {
    return undefined;
  }
}

/**
 * What is wrong with the plugins `connectors` use: one problem for each
 * connector whose plugin isn't added, since each names it in its own file,
 * and one for each plugin that is off or can't be read, however many
 * connectors use it. With `added` left out, because the plugins folder
 * can't be listed, every plugin they use is one that can't be read.
 *
 * @example
 * doctorPluginProblems([orders], [{ id: "acme-orders", state: "changed" }]);
 * // [{ problem: "off", plugin: "acme-orders", why: "changed" }]
 */
export function doctorPluginProblems(
  connectors: readonly Connector[],
  added: readonly AddedPlugin[] | undefined,
): DoctorPluginProblem[] {
  const problems: DoctorPluginProblem[] = [];
  const named = new Set<string>();
  for (const connector of connectors) {
    if (!("plugin" in connector.transport)) continue;
    const plugin = connector.transport.plugin.id;
    const found: ConnectorPlugin =
      added === undefined ? { state: "broken" } : connectorPlugin(plugin, added);
    if (found.state === "not_added") {
      problems.push({ problem: "not-added", connector: connector.id, plugin, near: found.near });
      continue;
    }
    if (found.state === "on" || named.has(plugin)) continue;
    named.add(plugin);
    problems.push(
      found.state === "broken"
        ? { problem: "broken", plugin }
        : { problem: "off", plugin, why: found.why === "changed" ? "changed" : "not-trusted" },
    );
  }
  return problems;
}
