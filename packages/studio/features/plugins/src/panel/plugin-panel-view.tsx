import type { ItemViewProps } from "@halonicjs/studio-shell";
import { type ComponentType, useSyncExternalStore } from "react";
import { PluginPanel } from "./plugin-panel.tsx";
import { type PluginPanelOptions, panelPlugin } from "./plugin-panels.ts";

/** The `plugin-panel` kind's view for the Studio's plugins; see `pluginPanelKind`. */
export function panelView(options: PluginPanelOptions): ComponentType<ItemViewProps> {
  return function PluginPanelView({ item }: ItemViewProps) {
    // Read again whenever the plugins change, so a plugin turned off shows it at once (G7).
    useSyncExternalStore(options.feed.subscribe, options.feed.current);
    const plugin = panelPlugin(options.feed, item);
    // A plugin removed, or without a panel any more, draws nothing. The kind's `exists` says so,
    // for the shell to close the tab (G7).
    if (plugin === undefined) return null;
    const who = { id: plugin.plugin, name: plugin.name };
    return (
      <PluginPanel
        plugin={who}
        status={plugin.status}
        title={plugin.panel.title}
        commands={plugin.commands}
        cards={plugin.cards}
        caller={options.caller}
        onCommand={(command) => options.opener.open(who, command)}
        onReview={() => options.review(plugin.plugin)}
        onDetails={() => options.details(plugin.plugin)}
      />
    );
  };
}
