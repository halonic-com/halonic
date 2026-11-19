import { useEffect } from "react";
import type { ItemKindContribution } from "../points/item-kinds.ts";
import type { Registered } from "../points/point-store.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { renameItemTabs } from "./item-tab-names.ts";
import { itemOfLocationKey } from "./item-view.tsx";

/**
 * Closes every tab whose current place is an item of `kind` that the kind says is gone, one by
 * one the way Ctrl W closes a tab, so the same tab becomes active and Ctrl Shift T brings it back.
 * A gone item further back in a tab's history leaves the tab open.
 */
export function closeGoneItemTabs(
  tabs: TabSet,
  kind: Registered<ItemKindContribution>,
  context: WorkspaceContext,
): void {
  const behaviour = kind.tab;
  if (behaviour === undefined) {
    return;
  }
  const gone = tabs.state.tabs.filter((tab) => {
    const item = itemOfLocationKey(currentLocation(tab).key);
    return item !== undefined && item.kind === kind.kind && !behaviour.exists(item, context);
  });
  for (const tab of gone) {
    tabs.close(tab.id);
  }
}

/**
 * Listens to every item kind whose tabs have a `subscribe`, and each time it says they changed
 * closes the tabs of its items that are gone (`shell.gone-item-tabs`) and names the others again
 * (`shell.item-tab-names`). Each kind gets the context of the feature that added it.
 */
export function useClosingGoneItemTabs(
  tabs: TabSet,
  kinds: readonly Registered<ItemKindContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): void {
  useEffect(() => {
    const stops = kinds.flatMap((kind) => {
      if (kind.tab?.subscribe === undefined) {
        return [];
      }
      const context = contextFor(kind.featureId);
      const follow = () => {
        closeGoneItemTabs(tabs, kind, context);
        renameItemTabs(tabs, kind, context);
      };
      return [kind.tab.subscribe(follow, context)];
    });
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [tabs, kinds, contextFor]);
}
