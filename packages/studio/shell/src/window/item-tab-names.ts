import type { ItemKindContribution } from "../points/item-kinds.ts";
import type { Registered } from "../points/point-store.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
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
  const behaviour = kind.tab;
  if (behaviour === undefined) {
    return;
  }
  for (const tab of tabs.state.tabs) {
    const location = currentLocation(tab);
    const item = itemOfLocationKey(location.key);
    if (item === undefined || item.kind !== kind.kind) {
      continue;
    }
    const { label } = behaviour.describe(item, context);
    if (label !== location.title) {
      tabs.rename(location.key, label);
    }
  }
}
