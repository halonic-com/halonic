// The plugins a workspace's connectors use, checked against the ones added
// on this computer, for the Plugins line of `halonic doctor` (HAL-14296).

import type { DoctorPluginProblem } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import { type AddedPlugin, connectorPlugin } from "./connector-plugin.ts";

/**
 * What is wrong with the plugins `connectors` use: one problem for each
 * connector whose plugin isn't added, and one for each plugin that is off
 * or can't be read, however many connectors use it.
 *
 * @example
 * doctorPluginProblems([orders], [{ id: "acme-orders", state: "changed" }]);
 * // [{ problem: "off", plugin: "acme-orders", why: "changed" }]
 */
export function doctorPluginProblems(
  connectors: readonly Connector[],
  added: readonly AddedPlugin[],
): DoctorPluginProblem[] {
  const problems: DoctorPluginProblem[] = [];
  const named = new Set<string>();
  for (const connector of connectors) {
    if (!("plugin" in connector.transport)) continue;
    const plugin = connector.transport.plugin.id;
    const found = connectorPlugin(plugin, added);
    if (found.state === "not_added") {
      problems.push({ problem: "not-added", connector: connector.id, plugin, near: found.near });
    } else if (found.state !== "on" && !named.has(plugin)) {
      named.add(plugin);
      problems.push(
        found.state === "broken"
          ? { problem: "broken", plugin }
          : { problem: "off", plugin, why: found.why === "changed" ? "changed" : "not-trusted" },
      );
    }
  }
  return problems;
}
