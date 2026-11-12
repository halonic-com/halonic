import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import type { PluginToolCaller } from "./commands/plugin-command-dialog.tsx";
import { PluginCommandOpener } from "./commands/plugin-command-source.ts";
import { timedToolCaller } from "./commands/tool-call-timeout.ts";
import type { PluginPanelFeed, PluginPanelOptions } from "./panel/plugin-panels.ts";

/**
 * What the app gives the plugins feature for an open workspace: the installed plugins as they
 * change, and the way to call their tools. Plugins are installed per computer, so every
 * workspace may get the same one.
 */
export interface PluginsHost {
  readonly feed: PluginPanelFeed;
  readonly caller: PluginToolCaller;
}

/**
 * The plugins of one open workspace as the feature's contributions use them: the host's feed,
 * its tool calls with the 30-second limit, and which command's dialog is open.
 */
export interface StudioPlugins {
  readonly feed: PluginPanelFeed;
  readonly caller: PluginToolCaller;
  readonly opener: PluginCommandOpener;
}

/** The plugins of a workspace, built from what the app gives. */
export function studioPlugins(host: PluginsHost): StudioPlugins {
  return {
    feed: host.feed,
    caller: timedToolCaller(host.caller),
    opener: new PluginCommandOpener(),
  };
}

/** The hub part of a plugin's places: plugins are installed per computer, not in a hub. */
export const PLUGIN_HUB = "this-computer";

/** The item kind of a plugin's own page (design section 7). */
export const PLUGIN_KIND = "plugin";

/** The item a plugin's page is. */
export function pluginPageItem(plugin: string): ItemRef {
  return { kind: PLUGIN_KIND, hub: PLUGIN_HUB, id: plugin };
}

/**
 * What a panel and Home's cards need, for the context of a view: the workspace's plugins, with
 * Review and Details opening the plugin's page, where its trust check and its problems are.
 */
export function panelOptions(
  plugins: StudioPlugins,
  context: WorkspaceContext,
): PluginPanelOptions {
  const openPage = (plugin: string) => context.openItem?.(pluginPageItem(plugin));
  return { ...plugins, review: openPage, details: openPage };
}
