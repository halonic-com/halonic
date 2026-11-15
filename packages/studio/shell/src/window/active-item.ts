import type { ItemRef } from "../points/item-kinds.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { ActiveItemSource } from "../workspace-context.ts";
import { itemOfLocationKey } from "./item-view.tsx";

/** Whether two readings name the same item (or both name none). */
function sameItem(left: ItemRef | null, right: ItemRef | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.kind === right.kind && left.hub === right.hub && left.id === right.id;
}

/**
 * The item the active tab shows, as `WorkspaceContext.activeItem` gives it: its `ItemRef`, or
 * `null` when the active tab shows Home, a place or a search. `get` returns the same reference
 * until the item changes, so `useSyncExternalStore(subscribe, get)` can read it. A listener hears
 * only a change of item, not a tab switch between two tabs on the same item, a rename or a move
 * in history that lands on the same item.
 */
export function activeItemOf(tabs: TabSet): ActiveItemSource {
  let last: ItemRef | null = null;
  const get = (): ItemRef | null => {
    const now = itemOfLocationKey(currentLocation(tabs.active).key) ?? null;
    if (!sameItem(last, now)) {
      last = now;
    }
    return last;
  };
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
