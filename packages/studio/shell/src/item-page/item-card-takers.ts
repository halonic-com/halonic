import { useContext, useEffect, useRef } from "react";
import type { ItemRef } from "../points/item-kinds.ts";
import { TabPageContext } from "./remembered-view.ts";

/** Opens `item` as a card on the page and says `true`, or says `false` when it doesn't belong there. */
export type ItemCardTaker = (item: ItemRef) => boolean;

/**
 * The pages that can show an item as one of their stacked cards, by the tab they are drawn in, so
 * the window's `showItem` can ask the active tab's page first (`shell.panels.show-replaces-windows`).
 * One per window, kept by `TabPages`. A tab whose page isn't mounted has no taker.
 */
export class ItemCardTakers {
  private readonly takers = new Map<string, ItemCardTaker>();

  /** Lets the page in tab `tabId` take items. Returns a function that stops it. */
  add(tabId: string, take: ItemCardTaker): () => void {
    this.takers.set(tabId, take);
    return () => {
      // A page drawn afresh in the same tab may have added its own taker by now.
      if (this.takers.get(tabId) === take) {
        this.takers.delete(tabId);
      }
    };
  }

  /** Asks the page in tab `tabId` to take `item`; `false` when it has no taker or doesn't take it. */
  take(tabId: string, item: ItemRef): boolean {
    return this.takers.get(tabId)?.(item) ?? false;
  }
}

/**
 * Lets an item page show an item as one of its stacked cards when the window's `showItem` asks the
 * active tab: `take` opens the card and says `true`, or says `false` for an item that doesn't belong
 * on the page, which then opens in its own tab. It always reads the latest `take`. Outside
 * `TabPages` (a test, a preview, a phone) it does nothing.
 *
 * @example
 * useItemCardTaker((item) => {
 *   const sub = team.find((member) => member.id === item.id);
 *   if (item.kind !== "agent" || sub === undefined) return false;
 *   openSubagent(sub);
 *   return true;
 * });
 */
export function useItemCardTaker(take: ItemCardTaker): void {
  const page = useContext(TabPageContext);
  const latest = useRef(take);
  latest.current = take;
  const takers = page?.cardTakers;
  const tabId = page?.tabId;
  useEffect(() => {
    if (takers === undefined || tabId === undefined) {
      return;
    }
    return takers.add(tabId, (item) => latest.current(item));
  }, [takers, tabId]);
}
