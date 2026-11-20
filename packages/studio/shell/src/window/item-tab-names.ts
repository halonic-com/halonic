import type { ItemKindContribution } from "../points/item-kinds.ts";
import type { Registered } from "../points/point-store.ts";
import { currentLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { itemOfLocationKey } from "./item-view.tsx";

/**
 * Names each tab whose current place is an item of `kind` as the kind's `describe` names it now,
 * where that differs. A tab opened before the feature knew the item's name shows its id until then.
 */
export function renameItemTabs(
  tabs: TabSet,
  kind: Registered<ItemKindContribution>,
  context: WorkspaceContext,
): void {
  for (const tab of tabs.state.tabs) {
    const location = currentLocation(tab);
    const label = itemTitle(kind, context, location);
    if (label !== undefined && label !== location.title) {
      tabs.rename(location.key, label);
    }
  }
}

/**
 * The name `kind`'s `describe` gives the item at `location` now, or `undefined` when the place
 * isn't an item of that kind (or the kind's tabs have no `describe`).
 */
export function itemTitle(
  kind: Registered<ItemKindContribution>,
  context: WorkspaceContext,
  location: TabLocation,
): string | undefined {
  const item = itemOfLocationKey(location.key);
  if (kind.tab === undefined || item === undefined || item.kind !== kind.kind) {
    return undefined;
  }
  return kind.tab.describe(item, context).label;
}
