import type { WorkspaceContext } from "@halonicjs/studio-shell";
import type { PluginToolCaller } from "./commands/plugin-command-dialog.tsx";
import { PluginCommandOpener } from "./commands/plugin-command-source.ts";
import { timedToolCaller } from "./commands/tool-call-timeout.ts";
import {
  type InstalledPluginFeed,
  type PluginPageOptions,
  pluginPageItem,
} from "./page/plugin-pages.ts";
import { type PluginPanelOptions, pluginPanelItem } from "./panel/plugin-panels.ts";
import type {
  PluginSecretStore,
  PluginSettingsReader,
} from "./settings/plugin-settings-section.tsx";

/**
 * What the app gives the plugins feature for an open workspace: the installed plugins as they
 * change, the way to call their tools, their settings and the keychain for their secrets. Plugins
 * are installed per computer, so every workspace may get the same one.
 */
export interface PluginsHost {
  readonly feed: InstalledPluginFeed;
  readonly caller: PluginToolCaller;
  /** Core's `PluginService`, which reads and saves the plugins' settings. */
  readonly settings: PluginSettingsReader;
  /** The keychain: `TauriSecrets` on the desktop. */
  readonly secrets: PluginSecretStore;
}

/**
 * The plugins of one open workspace as the feature's contributions use them: the host's feed,
 * its tool calls with the 30-second limit, and which command's dialog is open.
 */
export interface StudioPlugins {
  readonly feed: InstalledPluginFeed;
  readonly caller: PluginToolCaller;
  readonly opener: PluginCommandOpener;
  readonly settings: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
}

/** The plugins of a workspace, built from what the app gives. */
export function studioPlugins(host: PluginsHost): StudioPlugins {
  return {
    feed: host.feed,
    caller: timedToolCaller(host.caller),
    opener: new PluginCommandOpener(),
    settings: host.settings,
    secrets: host.secrets,
  };
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

/** What a plugin's page needs, for the context of a view: **Open panel** opens the panel's tab. */
export function pageOptions(plugins: StudioPlugins, context: WorkspaceContext): PluginPageOptions {
  return {
    feed: plugins.feed,
    settings: plugins.settings,
    secrets: plugins.secrets,
    openPanel: (plugin) => context.openItem?.(pluginPanelItem(plugin)),
  };
}
