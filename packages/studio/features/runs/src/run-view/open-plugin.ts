import type { WorkspaceContext } from "@halonicjs/studio-shell";

/** The item kind of a plugin's own page (`features/plugins`). */
const pluginKind = "plugin";
/** The hub part of a plugin page's place: plugins are installed per computer, not in a hub. */
const pluginHub = "this-computer";

/**
 * Opens a plugin's own page by its id, `plugin/this-computer/<id>`, for the plugin a step's
 * connector didn't start for: that page has the trust step (HAL-15453). `undefined` where the
 * window can't open tabs, and the plugin's name isn't a link.
 */
export function openPluginOf(
  context: Pick<WorkspaceContext, "openItem">,
): ((pluginId: string) => void) | undefined {
  const { openItem } = context;
  if (openItem === undefined) {
    return undefined;
  }
  return (pluginId) => openItem({ kind: pluginKind, hub: pluginHub, id: pluginId });
}
