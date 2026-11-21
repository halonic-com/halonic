// What `halonic validate` adds for a plugin connector whose plugin isn't added
// on this computer (HAL-15123). The connector's file is fine, so the loader
// passes it, but it gives no tools: after `plugin remove`, or with a typo in
// the plugin's id, nothing said so before a run.

import { filesOf, type LoadedWorkspace, type WorkspaceIssue } from "@halonicjs/workspace";
import { type AddedPlugin, connectorPlugin } from "./connector-plugin.ts";
import { plainText } from "./messages/phrase.ts";
import { toolsMessages } from "./messages/tools.ts";
import { printable } from "./output/printable.ts";

/** The code of the warning, in `validate`'s line and its `--json`. */
export const pluginNotAddedCode = "plugin-not-added";

/**
 * One warning per plugin connector whose plugin isn't among `added`, on the
 * connector's file, with the added plugin whose id is close when there is
 * one (`cli.connector-plugin`). A plugin that is added but off isn't
 * reported here: the run says so, and `plugin list` shows it.
 *
 * @example
 * pluginConnectorProblems(workspace, [{ id: "acme-orders", state: "on" }]);
 * // [{ file: "library/connectors/orders.connector.yaml", severity: "warning", code: "plugin-not-added", … }]
 */
export function pluginConnectorProblems(
  workspace: LoadedWorkspace,
  added: readonly AddedPlugin[],
): WorkspaceIssue[] {
  const problems: WorkspaceIssue[] = [];
  for (const connector of filesOf(workspace, "connector")) {
    const { transport } = connector.value;
    if (!("plugin" in transport)) continue;
    const plugin = connectorPlugin(transport.plugin.id, added);
    if (plugin.state !== "not_added") continue;
    const id = printable(transport.plugin.id);
    const near =
      plugin.near === undefined
        ? ""
        : ` ${plainText(toolsMessages.didYouMean(printable(plugin.near)).phrase)}`;
    problems.push({
      file: connector.path,
      severity: "warning",
      source: "check",
      code: pluginNotAddedCode,
      path: ["transport", "plugin", "id"],
      line: 1,
      col: 1,
      message: `${plainText(toolsMessages.pluginNotAdded(id).phrase)}${near}`,
    });
  }
  return problems;
}
