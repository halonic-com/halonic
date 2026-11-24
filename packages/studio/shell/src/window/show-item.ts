import type { ItemCardTakers } from "../item-page/item-card-takers.ts";
import { itemLocation } from "../palette/palette-groups.ts";
import type { ItemRef, OpenItemOptions } from "../points/item-kinds.ts";
import type { LayoutContributions } from "../points/layout-points.ts";
import type { TabLocation, TabSet } from "../tabs/tab-set.ts";
import type { ShownInWindow, WorkspaceContext } from "../workspace-context.ts";

/** What the window gives `showItemInWindow` and `itemLocationOf`. */
export interface WindowItems {
  readonly kinds: LayoutContributions["itemKinds"];
  /** The context of the feature that added a kind, for its `describe` and `exists`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * The item's place, named as its kind's tab names it (`tab.describe`), else by its id, as Ctrl K
 * opens a found item. `step` opens the page on that part of it.
 */
export function itemLocationOf(
  item: ItemRef,
  { kinds, contextFor }: WindowItems,
  options?: OpenItemOptions,
): TabLocation {
  const kind = kinds.get(item.kind);
  const label = kind?.tab?.describe(item, contextFor(kind.featureId)).label ?? item.id;
  const location = itemLocation(item, label, kinds);
  return options?.step === undefined ? location : { ...location, step: options.step };
}

/**
 * Shows `item` next to what the user is doing, on the desktop (`shell.panels.show-replaces-windows`):
 * as a card on the active tab's page when that page takes it, else in its own tab, which becomes
 * active without taking the focus. A kind no feature added, or an item its `tab.exists` says isn't
 * there, is `unknown` and changes nothing. `exists` is asked even for a kind without `subscribe`.
 */
export function showItemInWindow(
  item: ItemRef,
  tabs: TabSet,
  cardTakers: ItemCardTakers,
  items: WindowItems,
): ShownInWindow {
  const kind = items.kinds.get(item.kind);
  if (kind === undefined) {
    return { placed: "unknown" };
  }
  if (kind.tab !== undefined && !kind.tab.exists(item, items.contextFor(kind.featureId))) {
    return { placed: "unknown" };
  }
  const location = itemLocationOf(item, items);
  if (cardTakers.take(tabs.state.activeId, item)) {
    return { placed: "card", name: location.title };
  }
  tabs.openInNewTab(location, { activate: true });
  return { placed: "tab", name: location.title };
}
