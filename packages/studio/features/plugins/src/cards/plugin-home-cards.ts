import type { HomeCardContribution } from "@halonicjs/studio-shell";
import type { PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import type { PluginCardStatus, PluginCardUi } from "./plugin-card.tsx";

/**
 * One plugin's cards: its id, its name, which is untrusted text, where it stands and its
 * `ui.cards`. A plugin that's off still gives its cards, so they keep their place on Home.
 */
export interface PluginCards {
  readonly plugin: string;
  readonly name: string;
  readonly status: PluginCardStatus;
  readonly cards: readonly PluginCardUi[];
}

/**
 * The installed plugins' cards as they change while Studio runs (UX checklist B6): a plugin
 * that's trusted, turned off or removed changes them. `current` gives the same array, with the
 * same card objects, until something changes, as React's `useSyncExternalStore` needs.
 */
export interface PluginCardFeed {
  readonly current: () => readonly PluginCards[];
  /** Calls `listener` each time the cards change; returns the way to stop. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** What Home's plugin cards need from the Studio. */
export interface PluginHomeCardsOptions {
  readonly feed: PluginCardFeed;
  /** Calls a plugin's tools; wrap it in `timedToolCaller` so a call can't hang a card. */
  readonly caller: PluginToolCaller;
  /** Review on a card whose plugin isn't trusted: opens its trust check. */
  readonly review: (plugin: string) => void;
  /** Details on a card whose plugin can't load: opens its page. */
  readonly details: (plugin: string) => void;
}

/**
 * Home's Cards section (design 8.2, decision D3): every card of every installed plugin, after
 * Recent runs, two per row on desktop and one on a phone. With no cards the section isn't there.
 * The view is imported only when Home shows.
 *
 * @example
 * studio.home.addCard(pluginHomeCards({ feed, caller: timedToolCaller(pluginTools), review, details }));
 */
export function pluginHomeCards(options: PluginHomeCardsOptions): HomeCardContribution {
  return {
    id: "cards",
    view: "PluginHomeCards",
    load: async () => {
      const { homeCardsView } = await import("./plugin-home-cards-view.tsx");
      return { PluginHomeCards: homeCardsView(options) };
    },
  };
}
