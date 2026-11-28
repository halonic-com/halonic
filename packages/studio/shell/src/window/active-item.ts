import { isSidebarPlace } from "../points/frame.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { ActiveItemSource, ShownPage } from "../workspace-context.ts";
import { itemOfLocationKey } from "./item-view.tsx";
import type { PageItems } from "./page-items.ts";

/** Whether two readings name the same item (or both name none). */
function sameItem(left: ItemRef | null, right: ItemRef | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.kind === right.kind && left.hub === right.hub && left.id === right.id;
}

/**
 * The item the active tab shows, as `WorkspaceContext.activeItem` gives it: its `ItemRef`, or
 * `null` when the active tab shows Home, a place or a search. A place whose page shows an item
 * inside it (`pageItems`, `shell.page-item`) gives that item while the tab still shows that place.
 * `get` returns the same reference until the item changes, so
 * `useSyncExternalStore(subscribe, get)` can read it. A listener hears only a change of item, not a
 * tab switch between two tabs on the same item, a rename or a move in history that lands on the
 * same item.
 */
export function activeItemOf(tabs: TabSet, pageItems?: PageItems): ActiveItemSource {
  let last: ItemRef | null = null;
  const get = (): ItemRef | null => {
    const now = shownItem(tabs, pageItems);
    if (!sameItem(last, now)) {
      last = now;
    }
    return last;
  };
  return {
    get,
    subscribe(listener) {
      let heard = get();
      const onChange = () => {
        const now = get();
        if (now === heard) {
          return;
        }
        heard = now;
        listener();
      };
      const stopTabs = tabs.subscribe(onChange);
      const stopPages = pageItems?.subscribe(onChange);
      return () => {
        stopTabs();
        stopPages?.();
      };
    },
  };
}

/** The active tab's item, or the item its place's page set while the tab still shows that place. */
function shownItem(tabs: TabSet, pageItems: PageItems | undefined): ItemRef | null {
  const tab = tabs.active;
  const key = currentLocation(tab).key;
  const located = itemOfLocationKey(key);
  if (located !== undefined) return located;
  const page = pageItems?.of(tab.id);
  return page !== undefined && page.locationKey === key ? page.item : null;
}

/**
 * The page a location's key shows, as `WorkspaceContext.shown` gives it: `inbox` is the Inbox's
 * own page, `run/acme/r1` a run's page, and `library/agents` (a phone's list under a place) neither.
 */
export function shownPageOf(key: string): ShownPage {
  if (isSidebarPlace(key)) return { place: key };
  const item = itemOfLocationKey(key);
  return item === undefined ? {} : { item };
}
