import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { ActiveItemSource, ShownTitleSource } from "../workspace-context.ts";
import { activeItemOf } from "./active-item.ts";

/** What the active tab shows, as the window gives it to the desktop's features: its item and name. */
export function tabReadersOf(tabs: TabSet): {
  readonly activeItem: ActiveItemSource;
  readonly shownTitle: ShownTitleSource;
} {
  return { activeItem: activeItemOf(tabs), shownTitle: shownTitleOf(tabs) };
}

/**
 * The name of the page the active tab shows, as `WorkspaceContext.shownTitle` gives it: the tab's
 * label, such as "Home", "Changes" or an item's name as its kind's `describe` gives it. A listener
 * hears only a change of name: a tab switch, Back and Forward, or a rename, not a tab event that
 * leaves the name as it was.
 */
export function shownTitleOf(tabs: TabSet): ShownTitleSource {
  const get = (): string => currentLocation(tabs.active).title;
  return {
    get,
    subscribe(listener) {
      let heard = get();
      return tabs.subscribe(() => {
        const now = get();
        if (now === heard) {
          return;
        }
        heard = now;
        listener();
      });
    },
  };
}
