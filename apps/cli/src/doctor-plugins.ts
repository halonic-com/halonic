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
import { recordProblemOf } from "./doctor-plugin-records.ts";
import { UnreadablePluginsFolderError } from "./plugins-folder-reader.ts";

/**
 * `workspace`, with what is wrong with the plugins `connectors` use. The
 * profile's plugins are read only when a connector uses one, and not at all
 * on a computer that can't list them (`plugins` left out). When the plugins
 * folder itself can't be listed, each plugin the connectors use can't be
 * read, so the line says so and the other lines still show. When that is
 * because the person may not list it, the line names the folder and its fix
 * instead, since no plugin is at fault (HAL-15785). When a plugin record
 * file is to blame, the line already names it with its fix (HAL-15916), so
 * the plugins aren't listed again with a fix that fails on the same file.
 */
export async function withPluginProblems(
  workspace: DoctorWorkspace,
  connectors: readonly Connector[],
  plugins: AddedPlugins | undefined,
): Promise<DoctorWorkspace> {
  const usePlugins = connectors.some((connector) => "plugin" in connector.transport);
  if (plugins === undefined || !usePlugins) return workspace;
  const added = await addedOrUnreadable(plugins);
  if (added === "records") return workspace;
  const pluginProblems =
    added instanceof UnreadablePluginsFolderError
      ? [folderProblem(connectors, added)]
      : doctorPluginProblems(connectors, added);
  return pluginProblems.length === 0 ? workspace : { ...workspace, pluginProblems };
}

/**
 * The added plugins; the refusal when the person may not list the plugins
 * folder; `"records"` when a plugin record file can't be read; or
 * `undefined` when they can't be listed for another reason.
 */
async function addedOrUnreadable(
  plugins: AddedPlugins,
): Promise<readonly AddedPlugin[] | UnreadablePluginsFolderError | "records" | undefined> {
  try {
    return await plugins();
  } catch (error) {
    if (error instanceof UnreadablePluginsFolderError) return error;
    return recordProblemOf(error) === undefined ? undefined : "records";
  }
}

/** One problem for the plugins folder, with each plugin the connectors use once. */
function folderProblem(
  connectors: readonly Connector[],
  { folder, access }: UnreadablePluginsFolderError,
): DoctorPluginProblem {
  const plugins = connectors.flatMap((connector) =>
    "plugin" in connector.transport ? [connector.transport.plugin.id] : [],
  );
  return { problem: "folder-unreadable", folder, access, plugins: [...new Set(plugins)] };
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
