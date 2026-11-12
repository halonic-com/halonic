import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { PluginsHostService, PluginsService } from "./api.ts";
import { pluginHomeCards } from "./cards/plugin-home-cards.ts";
import {
  PLUGIN_COMMANDS_SOURCE,
  type PluginCommands,
  pluginCommandSource,
} from "./commands/plugin-command-source.ts";
import { pluginPageKind } from "./page/plugin-pages.ts";
import {
  PLUGIN_PANELS_SOURCE,
  type PluginPanelFeed,
  pluginPanelCommandSource,
  pluginPanelKind,
} from "./panel/plugin-panels.ts";
import { pageOptions, panelOptions, studioPlugins } from "./plugins-service.ts";

/**
 * The Plugins feature (`plugins.feature`). It builds the open workspace's plugins from what the
 * app provides (`PluginsHostService`) and adds what they show, drawn by Studio: their commands
 * and "Open *name* panel" in Ctrl K, the command dialog, their cards on Home, the panel's tab and
 * each plugin's own page.
 */
export const pluginsFeature = defineFeature({
  id: "plugins",
  title: "Plugins",
  needs: [PluginsHostService],
  provides: [PluginsService],
  register(studio) {
    studio.services.provide(PluginsService, (services) =>
      studioPlugins(services.get(PluginsHostService)),
    );
    studio.commands.addSource({
      id: PLUGIN_COMMANDS_SOURCE,
      commands: (context) => {
        if (context === undefined) return [];
        const { feed, opener } = context.services.get(PluginsService);
        return pluginCommandSource(() => commandsOf(feed), opener).commands();
      },
    });
    studio.commands.addSource({
      id: PLUGIN_PANELS_SOURCE,
      commands: (context) => {
        if (context === undefined) return [];
        const { feed } = context.services.get(PluginsService);
        return pluginPanelCommandSource(feed, (item) => context.openItem?.(item)).commands();
      },
    });
    studio.dialogs.add({
      id: "plugins.command-dialog",
      order: 10,
      view: "PluginCommandDialogs",
      load: () => import("./commands/plugin-command-dialogs.tsx"),
    });
    studio.itemKinds.add(
      pluginPageKind((context) => pageOptions(context.services.get(PluginsService), context)),
    );
    studio.itemKinds.add(pluginPanelKind(optionsFor));
    studio.home.addCard(pluginHomeCards(optionsFor));
  },
});

function optionsFor(context: WorkspaceContext) {
  return panelOptions(context.services.get(PluginsService), context);
}

/** The commands of the plugins that are on: one that's off, changed or broken gives none. */
function commandsOf(feed: PluginPanelFeed): PluginCommands[] {
  return feed
    .current()
    .filter((plugin) => plugin.status === "on")
    .map(({ plugin, name, commands }) => ({ plugin, name, ui: { commands } }));
}
