import type { ItemViewProps } from "@halonicjs/studio-shell";
import { type ComponentType, useSyncExternalStore } from "react";
import { PluginPage } from "./plugin-page.tsx";
import { type PluginPageOptions, pagePlugin } from "./plugin-pages.ts";

/** The `plugin` kind's view for the Studio's plugins; see `pluginPageKind`. */
export function pageView(
  optionsFor: (context: ItemViewProps["context"]) => PluginPageOptions,
): ComponentType<ItemViewProps> {
  return function PluginPageView({ item, context }: ItemViewProps) {
    const options = optionsFor(context);
    // Read again whenever the plugins change, so trusting, a change on disk or a fix shows at once.
    useSyncExternalStore(options.feed.subscribe, options.feed.current);
    const plugin = pagePlugin(options.feed, item);
    // A plugin removed draws nothing. The kind's `exists` says so, for the shell to close the tab.
    if (plugin === undefined) return null;
    return (
      <PluginPage
        // A new page for another plugin, so one plugin's settings never show under another's name.
        key={plugin.plugin}
        plugin={plugin}
        settings={options.settings}
        secrets={options.secrets}
        onOpenPanel={() => options.openPanel(plugin.plugin)}
      />
    );
  };
}
