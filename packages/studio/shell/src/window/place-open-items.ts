import { useCallback, useSyncExternalStore } from "react";
import type { TabSet } from "../tabs/tab-set.ts";

/**
 * The tab id the phone's pages use: the phone shows one page at a time, outside the tabs, so it
 * keeps one open item per place, which no tab's closing drops.
 */
export const phonePagesTab = "phone";

/**
 * Which item is open in each tab's place (`shell.rail-frame`), so a place's list column in the
 * window and its page agree. It's kept per tab, not per place: two tabs on one place each keep
 * their own, and a tab's are dropped when the tab closes.
 */
export class PlaceOpenItems {
  private readonly open = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly tabs: TabSet;

  constructor(tabs: TabSet) {
    this.tabs = tabs;
    tabs.subscribe(() => this.dropClosedTabs());
  }

  /** The item open in `tabId`'s `placeId`, or `undefined` for none. */
  get(tabId: string, placeId: string): string | undefined {
    return this.open.get(keyOf(tabId, placeId));
  }

  /** Opens `itemId` in `tabId`'s `placeId`, or closes what's open with `undefined`. */
  set(tabId: string, placeId: string, itemId: string | undefined): void {
    const key = keyOf(tabId, placeId);
    if (this.open.get(key) === itemId) return;
    if (itemId === undefined) this.open.delete(key);
    else this.open.set(key, itemId);
    this.notify();
  }

  /** Calls `listener` whenever an open item changes. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dropClosedTabs(): void {
    const kept = new Set(this.tabs.state.tabs.map((tab) => tab.id));
    kept.add(phonePagesTab);
    const before = this.open.size;
    for (const key of this.open.keys()) {
      if (!kept.has(tabOfKey(key))) this.open.delete(key);
    }
    if (this.open.size !== before) this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The window's open items: one store for each tab set, made the first time it's asked for. */
const storeOfTabs = new WeakMap<TabSet, PlaceOpenItems>();

/** The open items of the window whose tabs are `tabs`. */
export function placeOpenItemsOf(tabs: TabSet): PlaceOpenItems {
  const known = storeOfTabs.get(tabs);
  if (known !== undefined) return known;
  const store = new PlaceOpenItems(tabs);
  storeOfTabs.set(tabs, store);
  return store;
}

/** A place's open item in one tab, and its setter, following every change. */
export function usePlaceOpenItem(
  tabs: TabSet,
  tabId: string,
  placeId: string,
): { readonly open: string | undefined; readonly setOpen: (id: string | undefined) => void } {
  const store = placeOpenItemsOf(tabs);
  const open = useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    () => store.get(tabId, placeId),
  );
  const setOpen = useCallback(
    (id: string | undefined) => store.set(tabId, placeId, id),
    [store, tabId, placeId],
  );
  return { open, setOpen };
}

// A tab id never holds a line break, so the key splits back into the tab and the place.
function keyOf(tabId: string, placeId: string): string {
  return `${tabId}\n${placeId}`;
}

function tabOfKey(key: string): string {
  return key.slice(0, key.indexOf("\n"));
}
