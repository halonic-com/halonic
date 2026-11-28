import type { ItemRef } from "../points/item-kinds.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";

/** The item a tab's page shows inside it, with the place that page draws. */
export interface PageItem {
  /** The key of the place whose page set it, such as `runs`. */
  readonly locationKey: string;
  readonly item: ItemRef;
}

/**
 * The items the window's tab pages show inside them (`shell.page-item`), such as the run the Runs
 * page has open in its content pane, one per tab. Each is kept with the place that set it and
 * dropped once its tab shows another place or closes, even if the page never cleared it, so Back
 * to the place doesn't bring it back. Kept apart from the tabs, so it is never part of a tab's
 * history. It lives as long as `tabs`.
 */
export class PageItems {
  private readonly items = new Map<string, PageItem>();
  private readonly listeners = new Set<() => void>();
  private readonly tabs: TabSet;

  constructor(tabs: TabSet) {
    this.tabs = tabs;
    tabs.subscribe(() => this.dropLeft());
  }

  /** The item the page of tab `tabId` set, if any. */
  of(tabId: string): PageItem | undefined {
    return this.items.get(tabId);
  }

  /** Sets, or with `null` clears, the item the page of tab `tabId` on `locationKey` shows. */
  set(tabId: string, locationKey: string, item: ItemRef | null): void {
    const kept = this.items.get(tabId);
    if (item === null) {
      // A page that left its place clears late: keep what the place it moved to set.
      if (kept === undefined || kept.locationKey !== locationKey) return;
      this.items.delete(tabId);
    } else {
      this.items.set(tabId, { locationKey, item });
    }
    for (const listener of [...this.listeners]) listener();
  }

  /** Drops the items of tabs that closed or show another place now. */
  private dropLeft(): void {
    for (const [tabId, kept] of this.items) {
      const tab = this.tabs.state.tabs.find((candidate) => candidate.id === tabId);
      if (tab === undefined || currentLocation(tab).key !== kept.locationKey) {
        this.items.delete(tabId);
      }
    }
  }

  /** Calls `listener` on every change; returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** Each tab set's page items, made once, so a render run twice doesn't subscribe a second store. */
const pageItemsByTabs = new WeakMap<TabSet, PageItems>();

/** The page items of `tabs`: the same store for as long as the tab set lives. */
export function pageItemsOf(tabs: TabSet): PageItems {
  const kept = pageItemsByTabs.get(tabs);
  if (kept !== undefined) return kept;
  const made = new PageItems(tabs);
  pageItemsByTabs.set(tabs, made);
  return made;
}
