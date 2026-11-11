import type {
  CommandSource,
  ItemKindContribution,
  ItemRef,
  TabLocation,
} from "@halonicjs/studio-shell";
import type { PluginCards } from "../cards/plugin-home-cards.ts";
import { commandSource } from "../commands/command-text.ts";
import type { PluginCommand, PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import type { PluginCommandOpener } from "../commands/plugin-command-source.ts";
import { openPanelTitle, PLUGIN_PANEL, PLUGIN_PANEL_KIND_NAME } from "./panel-text.ts";

/** The item kind of a plugin's panel; its tab's place is `plugin-panel/this-computer/<plugin>`. */
export const PLUGIN_PANEL_KIND = "plugin-panel";

/** The hub part of a panel's place: plugins are installed per computer, not in a hub. */
const PANEL_HUB = "this-computer";

/** The id of the command source that opens panels; each command's id starts with it. */
export const PLUGIN_PANELS_SOURCE = "plugins.panels";

/**
 * One installed plugin as its panel needs it: its cards as Home has them, its commands and its
 * `ui.panel`, when it has one. A plugin that's off still gives them, so an open panel shows why.
 */
export interface PluginPanelUi extends PluginCards {
  readonly commands: readonly PluginCommand[];
  readonly panel?: { readonly title: string } | undefined;
}

/**
 * The installed plugins as they change while Studio runs. `current` gives the same array, with the
 * same objects, until something changes, as React's `useSyncExternalStore` needs. It also serves
 * as Home's `PluginCardFeed`.
 */
export interface PluginPanelFeed {
  readonly current: () => readonly PluginPanelUi[];
  /** Calls `listener` each time the plugins change; returns the way to stop. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** What a plugin's panel needs from the Studio. */
export interface PluginPanelOptions {
  readonly feed: PluginPanelFeed;
  /** Calls a plugin's tools; wrap it in `timedToolCaller` so a call can't hang a card. */
  readonly caller: PluginToolCaller;
  /** Opens a command's dialog, as Ctrl K does. */
  readonly opener: PluginCommandOpener;
  /** Review on a card whose plugin isn't trusted: opens its trust check. */
  readonly review: (plugin: string) => void;
  /** Details on a card whose plugin can't load: opens its page. */
  readonly details: (plugin: string) => void;
}

/** The item a plugin's panel is. */
export function pluginPanelItem(plugin: string): ItemRef {
  return { kind: PLUGIN_PANEL_KIND, hub: PANEL_HUB, id: plugin };
}

/**
 * The place of a plugin's panel, named by the panel's title. Opening it with the tabs' `openHere`
 * goes to its tab when one shows it already, so there's one tab per plugin (D2).
 */
export function pluginPanelLocation(plugin: string, title: string): TabLocation {
  return {
    key: `${PLUGIN_PANEL_KIND}/${PANEL_HUB}/${plugin}`,
    title,
    kind: PLUGIN_PANEL_KIND_NAME,
  };
}

/** The plugin with a panel that the feed gives now for `item`, if any. */
export function panelPlugin(
  feed: PluginPanelFeed,
  item: ItemRef,
): (PluginPanelUi & { readonly panel: { readonly title: string } }) | undefined {
  const plugin = feed.current().find((candidate) => candidate.plugin === item.id);
  if (plugin?.panel === undefined) return undefined;
  return { ...plugin, panel: plugin.panel };
}

/**
 * The `plugin-panel` item kind (design 8.3, decision D2, UX checklist B3): a plugin's panel opens
 * in its own tab, named by the panel's title, like any page. The view is imported the first time a
 * panel shows.
 *
 * @example
 * studio.itemKinds.add(pluginPanelKind({ feed, caller: timedToolCaller(tools), opener, review, details }));
 */
export function pluginPanelKind(options: PluginPanelOptions): ItemKindContribution {
  return {
    kind: PLUGIN_PANEL_KIND,
    label: PLUGIN_PANEL,
    icon: "plugin",
    open: {
      view: "PluginPanelView",
      load: async () => {
        const { panelView } = await import("./plugin-panel-view.tsx");
        return { PluginPanelView: panelView(options) };
      },
    },
    tab: {
      describe: (item) => ({ label: panelPlugin(options.feed, item)?.panel.title ?? item.id }),
      exists: (item) => panelPlugin(options.feed, item) !== undefined,
    },
  };
}

/**
 * The palette's "Open *name* panel" commands (design 8.3): one for each plugin that's on and has a
 * panel, as `plugins.panels.<plugin>`, with the source "*name* plugin". A plugin that's off has
 * none, like its other commands.
 *
 * @param open - opens a place in the active tab, such as `(place) => tabs.openHere(place)`
 *
 * @example
 * studio.commands.addSource(pluginPanelCommandSource(feed, (place) => tabs.openHere(place)));
 */
export function pluginPanelCommandSource(
  feed: PluginPanelFeed,
  open: (location: TabLocation) => void,
): CommandSource {
  return {
    id: PLUGIN_PANELS_SOURCE,
    commands: () =>
      feed.current().flatMap(({ plugin, name, status, panel }) =>
        status === "on" && panel !== undefined
          ? [
              {
                id: `${PLUGIN_PANELS_SOURCE}.${plugin}`,
                title: openPanelTitle(name),
                source: commandSource(name),
                run: () => open(pluginPanelLocation(plugin, panel.title)),
              },
            ]
          : [],
      ),
  };
}
