import { useEffect, useMemo, useState } from "react";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { ActiveItemSource, ShownTitleSource } from "../workspace-context.ts";
import { activeItemOf } from "./active-item.ts";
import { type PageItems, pageItemsOf } from "./page-items.ts";

/**
 * What the active tab shows, as the window gives it to the desktop's features: its item, or the
 * item its place's page set in `pageItems`, and its name.
 */
export function tabReadersOf(
  tabs: TabSet,
  pageItems?: PageItems,
): {
  readonly activeItem: ActiveItemSource;
  readonly shownTitle: ShownTitleSource;
} {
  return { activeItem: activeItemOf(tabs, pageItems), shownTitle: shownTitleOf(tabs) };
}

/**
 * What the window gives its features about the page it shows: on the desktop the active tab's
 * item and name, on a phone the name of the phone's own page (`phoneTitle`, as its top bar shows
 * it), and the desktop's `pageItems`, which a place's page in a tab sets (`shell.page-item`).
 * The same objects every render, so a feature's subscription stays.
 */
export function useShownReaders(
  tabs: TabSet,
  phoneTitle: string,
): {
  readonly desktop: ReturnType<typeof tabReadersOf>;
  readonly phone: { readonly shownTitle: ShownTitleSource };
  readonly pageItems: PageItems;
} {
  const [phone] = useState(() => phoneShownTitle(phoneTitle));
  // After the render that moved the phone, so a listener reads the new name.
  useEffect(() => phone.show(phoneTitle), [phone, phoneTitle]);
  return useMemo(() => {
    const pageItems = pageItemsOf(tabs);
    return {
      desktop: tabReadersOf(tabs, pageItems),
      phone: { shownTitle: phone.source },
      pageItems,
    };
  }, [tabs, phone]);
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

/**
 * The phone page's name as a `ShownTitleSource`, and `show` for the window to give it the name of
 * the page the phone moved to. A listener hears only a change of name.
 */
export function phoneShownTitle(first: string): {
  readonly source: ShownTitleSource;
  readonly show: (title: string) => void;
} {
  let title = first;
  const listeners = new Set<() => void>();
  return {
    source: {
      get: () => title,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    show(next) {
      if (next === title) {
        return;
      }
      title = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
